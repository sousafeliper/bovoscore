import json
import psycopg2
from pymongo import MongoClient
import os
import glob
from dotenv import load_dotenv

load_dotenv(dotenv_path='../.env')

def executar_pipeline_massa():
    print("⏳ Iniciando o Super Pipeline ETL para 19 Jogos...")

    try:
        pg_conn = psycopg2.connect(
            host=os.getenv("PG_HOST"), port=os.getenv("PG_PORT"),
            database=os.getenv("PG_DATABASE"), user=os.getenv("PG_USER"), password=os.getenv("PG_PASSWORD")
        )
        pg_cursor = pg_conn.cursor()
        
        mongo_client = MongoClient(os.getenv("MONGO_URI"))
        mongo_db = mongo_client[os.getenv("MONGO_DB_NAME")]
        colecao_eventos = mongo_db['match_events']
        print("✅ Bancos conectados!")
    except Exception as e:
        print(f"❌ Erro de conexão: {e}")
        return

    try:
        # 1. Resetando as tabelas
        pg_cursor.execute("DROP TABLE IF EXISTS match CASCADE;")
        pg_cursor.execute("DROP TABLE IF EXISTS team CASCADE;")
        pg_cursor.execute("""
            CREATE TABLE team (
                team_api_id INTEGER PRIMARY KEY, team_long_name VARCHAR(200)
            );
            CREATE TABLE match (
                match_api_id INTEGER PRIMARY KEY, home_team_api_id INTEGER REFERENCES team(team_api_id),
                away_team_api_id INTEGER REFERENCES team(team_api_id), date TIMESTAMP
            );
        """)
        
        # Garante o Real Madrid cadastrado (ID 220 na StatsBomb)
        pg_cursor.execute("INSERT INTO team (team_api_id, team_long_name) VALUES (220, 'Real Madrid') ON CONFLICT DO NOTHING;")

        # Limpa a coleção do Mongo para não duplicar
        colecao_eventos.delete_many({})

        # 2. Varrendo a pasta com os 19 arquivos
        caminho_pasta = 'jogos_rm/*.json'
        arquivos = glob.glob(caminho_pasta)
        print(f"📂 Encontrados {len(arquivos)} jogos. Processando...")

        for arquivo in arquivos:
            with open(arquivo, 'r', encoding='utf-8') as f:
                eventos = json.load(f)

            # Extrai o ID da partida pelo nome do arquivo (ex: '3825806.json' -> 3825806)
            match_id = int(os.path.basename(arquivo).replace('.json', ''))
            
            # Descobre o time visitante dinamicamente olhando o primeiro evento do visitante
            away_team_id = None
            away_team_name = "Visitante Desconhecido"
            for e in eventos:
                if e.get('team', {}).get('id') not in [None, 220]: # Se não for o Real Madrid
                    away_team_id = e['team']['id']
                    away_team_name = e['team']['name']
                    break

            # Insere o Time Visitante no Postgres (se já existir, ele ignora)
            if away_team_id:
                pg_cursor.execute("INSERT INTO team (team_api_id, team_long_name) VALUES (%s, %s) ON CONFLICT DO NOTHING;", (away_team_id, away_team_name))
            
            # Insere a partida no Postgres
            pg_cursor.execute("INSERT INTO match (match_api_id, home_team_api_id, away_team_api_id, date) VALUES (%s, %s, %s, '2016-01-01 20:00:00');", (match_id, 220, away_team_id))

            # Prepara os eventos pro Mongo
            eventos_preparados = []
            for evento in eventos:
                evento['match_id_relational'] = match_id
                eventos_preparados.append(evento)

            # Insere os milhares de lances desse jogo no Mongo
            colecao_eventos.insert_many(eventos_preparados)
            print(f"✔️ Jogo {match_id} processado! ({len(eventos_preparados)} eventos no Mongo)")

        pg_conn.commit()
        print("🎉 TODOS OS JOGOS CARREGADOS COM SUCESSO!")

    except Exception as e:
        pg_conn.rollback()
        print(f"❌ Erro no processamento: {e}")
    finally:
        pg_cursor.close()
        pg_conn.close()

if __name__ == '__main__':
    executar_pipeline_massa()