from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from pymongo import MongoClient
import os
from dotenv import load_dotenv

# Carrega as variáveis do .env
load_dotenv()

app = FastAPI(title="FootStats Analytics API - Real Madrid")

# Permite que o Frontend (que vai rodar em outra porta) acesse a API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Conexão Global (Variáveis)
pg_conn = None
mongo_db = None

@app.on_event("startup")
def startup_db_client():
    global pg_conn, mongo_db
    
    print("⏳ Tentando conectar aos bancos de dados na nuvem...")
    
    try:
        pg_conn = psycopg2.connect(
            host=os.getenv("PG_HOST"),
            port=os.getenv("PG_PORT"),
            database=os.getenv("PG_DATABASE"),
            user=os.getenv("PG_USER"),
            password=os.getenv("PG_PASSWORD"),
            connect_timeout=10 # Falha rápido se estiver bloqueado
        )
        print("✅ Postgres conectado!")
    except Exception as e:
        print(f"❌ FALHA CRÍTICA NO POSTGRES: O Google Cloud está bloqueando o seu IP ou a senha está errada. Detalhe: {e}")
        raise e

    try:
        mongo_client = MongoClient(os.getenv("MONGO_URI"), serverSelectionTimeoutMS=10000)
        mongo_client.admin.command('ping') # Testa se realmente conecta
        mongo_db = mongo_client[os.getenv("MONGO_DB_NAME")]
        print("✅ MongoDB Atlas conectado!")
    except Exception as e:
        print(f"❌ FALHA CRÍTICA NO MONGO: Verifique o Network Access no Atlas ou sua conexão de internet. Detalhe: {e}")
        raise e

@app.on_event("shutdown")
def shutdown_db_client():
    if pg_conn:
        pg_conn.close()

# ROTA 1: Pega os dados estruturados do jogo no Postgres
@app.get("/api/match/{match_id}")
def get_match_info(match_id: int):
    cursor = pg_conn.cursor()
    query = """
        SELECT m.match_api_id, h.team_long_name as home_team, a.team_long_name as away_team, 
               m.home_team_goal, m.away_team_goal, m.date
        FROM match m
        JOIN team h ON m.home_team_api_id = h.team_api_id
        JOIN team a ON m.away_team_api_id = a.team_api_id
        WHERE m.match_api_id = %s
    """
    cursor.execute(query, (match_id,))
    result = cursor.fetchone()
    cursor.close()
    
    if not result:
        raise HTTPException(status_code=404, detail="Partida não encontrada no Postgres")
        
    return {
        "id": result[0],
        "home_team": result[1],
        "away_team": result[2],
        "home_team_goal": result[3],
        "away_team_goal": result[4],
        "date": result[5]
    }

# ROTA 2: Pega os lances da partida no MongoDB Atlas
@app.get("/api/match/{match_id}/events")
def get_match_events(match_id: int, event_type: str = "Shot"):
    # Busca apenas os lances do tipo especificado para a partida (Ex: Shot ou Pass)
    events = list(mongo_db.match_events.find(
        {"match_id_relational": match_id, "type.name": event_type},
        {"_id": 0} # Remove o ID nativo do Mongo para facilitar o JSON
    ))
    return {"match_id": match_id, "event_type": event_type, "total": len(events), "events": events}

# ROTA 3: Retorna a lista de todas as partidas para o Dropdown
@app.get("/api/matches")
def get_all_matches():
    cursor = pg_conn.cursor()
    query = """
        SELECT m.match_api_id, h.team_long_name, a.team_long_name 
        FROM match m
        JOIN team h ON m.home_team_api_id = h.team_api_id
        JOIN team a ON m.away_team_api_id = a.team_api_id
    """
    cursor.execute(query)
    matches = cursor.fetchall()
    cursor.close()

    lista = []
    for m in matches:
        lista.append({"id": m[0], "title": f"{m[1]} vs {m[2]}"})
    return lista

# ROTA 4: Busca os detalhes da Liga e do Estádio (Dados Macros - Postgres)
@app.get("/api/match/{match_id}/info")
def get_match_macro_info(match_id: int):
    cursor = pg_conn.cursor()
    # Adapte os nomes das colunas conforme o modelo do Kaggle que você subiu
    query = """
        SELECT m.season, m.stage, l.name as league_name, c.name as country_name
        FROM match m
        LEFT JOIN league l ON m.league_id = l.id
        LEFT JOIN country c ON l.country_id = c.id
        WHERE m.match_api_id = %s
    """
    cursor.execute(query, (match_id,))
    info = cursor.fetchone()
    cursor.close()
    
    if info:
        return {"season": info[0], "stage": info[1], "league": info[2], "country": info[3]}
    return {"error": "Dados da liga não encontrados"}

# ROTA 5: Busca o Elenco (Roster) do time no Postgres
@app.get("/api/team/{team_api_id}/players")
def get_team_roster(team_api_id: int):
    cursor = pg_conn.cursor()
    query = """
        SELECT player_name, birthday, height, weight 
        FROM player 
        WHERE id IN (
            -- Lógica para pegar jogadores vinculados ao time (adapte conforme sua tabela)
            SELECT player_api_id FROM team_player WHERE team_api_id = %s
        ) LIMIT 11
    """
    # NOTA: Como o Kaggle às vezes tem esquemas complexos para elencos, 
    # ajuste a query acima para bater com as tabelas que você tem no banco.
    cursor.execute(query, (team_api_id,))
    players = cursor.fetchall()
    cursor.close()
    
    return [{"name": p[0], "birthday": p[1], "height": p[2], "weight": p[3]} for p in players]

# ROTA DE PESQUISA: Busca jogadores no Postgres
@app.get("/api/search/players")
def search_players(name: str):
    cursor = pg_conn.cursor()
    query = """
        SELECT player_api_id, player_name, birthday, height, weight 
        FROM player 
        WHERE player_name ILIKE %s
        LIMIT 10
    """
    try:
        cursor.execute(query, (f"%{name}%",))
        players = cursor.fetchall()
        return [{"id": p[0], "name": p[1], "birthday": p[2], "height": p[3], "weight": p[4]} for p in players]
    except Exception as e:
        pg_conn.rollback() # Limpa a transação com erro para não travar o banco
        return {"error": str(e)}
    finally:
        cursor.close()
        
# ROTA DA PARTIDA COMPLETA (Traz os 4000 lances do Mongo)
@app.get("/api/match/{match_id}/allevents")
def get_all_match_events(match_id: int):
    events = list(mongo_db.match_events.find(
        {"match_id_relational": match_id},
        {"_id": 0}
    ))
    return events

# =========================================================
# ROTAS DO SQL EXPLORER (A PONTE NOSQL -> SQL)
# =========================================================

@app.get("/api/explorer/teams")
def get_all_teams():
    cursor = pg_conn.cursor()
    try:
        # Removido o 'team_short_name' para não quebrar a consulta no seu banco
        cursor.execute("SELECT team_api_id, team_long_name FROM team ORDER BY team_long_name LIMIT 100")
        teams = cursor.fetchall()
        
        # O Python agora monta o JSON apenas com ID e Nome (t[0] e t[1])
        return [{"id": t[0], "name": t[1]} for t in teams]
    except Exception as e:
        pg_conn.rollback()
        return {"error": str(e)}
    finally:
        cursor.close()

@app.get("/api/explorer/teams/{team_id}/players")
def get_team_players(team_id: int):
    try:
        # 1. Busca as escalações reais daquele time no MONGODB (Garante precisão)
        events = mongo_db.match_events.find({"type.name": "Starting XI", "team.id": team_id})
        statsbomb_names = set()
        
        for e in events:
            for p in e["tactics"]["lineup"]:
                statsbomb_names.add(p["player"]["name"])
        
        if not statsbomb_names:
            return {"error": "Elenco não localizado nas partidas."}
        
        # 2. Faz o 'De/Para' com o POSTGRESQL usando processamento de texto
        cursor = pg_conn.cursor()
        matched_players = []
        
        for sb_name in statsbomb_names:
            parts = sb_name.split()
            # Pega o primeiro e segundo nome para máxima chance de acerto no Kaggle (Ex: "Keylor%Navas%")
            if len(parts) >= 2:
                search_str = f"{parts[0]}%{parts[1]}%"
            else:
                search_str = f"{sb_name}%"
            
            cursor.execute("SELECT player_api_id, player_name FROM player WHERE player_name ILIKE %s LIMIT 1", (search_str,))
            row = cursor.fetchone()
            
            if row:
                matched_players.append({"id": row[0], "name": row[1]})
            else:
                # Fallback: Tenta só pelo primeiro nome se o nome completo for muito diferente
                cursor.execute("SELECT player_api_id, player_name FROM player WHERE player_name ILIKE %s LIMIT 1", (f"{parts[0]}%",))
                row_fallback = cursor.fetchone()
                if row_fallback:
                    matched_players.append({"id": row_fallback[0], "name": row_fallback[1]})
        
        cursor.close()
        
        # Remove eventuais duplicatas e retorna
        final_list = {p['id']: p for p in matched_players}.values()
        return list(final_list)
        
    except Exception as e:
        pg_conn.rollback()
        return {"error": str(e)}

@app.get("/api/explorer/players/{player_id}")
def get_player_attributes(player_id: int):
    cursor = pg_conn.cursor()
    try:
        query = """
            SELECT player_name, birthday, height, weight 
            FROM player 
            WHERE player_api_id = %s
        """
        cursor.execute(query, (player_id,))
        p = cursor.fetchone()
        
        if p:
            # CONVERSÃO DEFINITIVA DO PESO (Libras para Quilos)
            # A base do Kaggle está em 'lbs'. 1 libra = 0.453592 kg
            peso_lbs = p[3]
            peso_kg = round(peso_lbs * 0.453592, 1) if peso_lbs else "N/A"
            
            # Altura já está em cm, apenas arredondamos
            altura_cm = round(p[2]) if p[2] else "N/A"

            return {
                "name": p[0], 
                "birthday": p[1], 
                "height": altura_cm, 
                "weight": peso_kg
            }
            
        return {"error": "Jogador não encontrado no Banco Relacional."}
    except Exception as e:
        pg_conn.rollback()
        return {"error": str(e)}
    finally:
        cursor.close()