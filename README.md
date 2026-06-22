# BovoScore ⚽📊

**Projeto Final da disciplina de Banco de Dados** | *Bacharelado em Inteligência Artificial - Instituto de Informática - Universidade Federal de Goiás (UFG)*

A **BovoScore** é uma plataforma de análise de informações e eventos de futebol. O projeto tem como principal objetivo demonstrar a implementação prática de uma **Arquitetura de Persistência Poliglota**, integrando dados de fontes distintas e com naturezas estruturais diferentes.


## Arquitetura Poliglota:

O futebol gera métricas que exigem diferentes abordagens de armazenamento. Para resolver este problema, a BovoScore divide as suas responsabilidades em dois ambientes distintos na nuvem:

1. **PostgreSQL (Google Cloud SQL) - O Dicionário Relacional:**
   * **O que armazena:** Dados estruturados, altamente relacionados e de mudança pouco frequente (Ligas, Clubes, Ficha Física dos Jogadores e Calendário de Jogos).
   * **Origem dos Dados:** *European Soccer Database* (Kaggle).
   * **Justificação:** Garante a integridade referencial estrita (ACID) das informações institucionais. O módulo **SQL Explorer** da nossa aplicação consome esta base para apresentar a volumetria e cruzar dados de elencos em tempo real.

2. **MongoDB (Atlas) - O Motor de Eventos (NoSQL):**
   * **O que armazena:** A torrente massiva de dados semiestruturados (*Play-by-Play*). Cada jogo gera cerca de 4.000 documentos JSON detalhando passes, remates e coordenadas espaciais (X/Y).
   * **Origem dos Dados:** *StatsBomb Open Data* (Focando numa temporada do Real Madrid como mandante).
   * **Justificação:** O polimorfismo do NoSQL permite que um evento de "Remate" possua atributos de *Expected Goals* (xG), enquanto um evento de "Passe" possua ângulos e distâncias, tudo na mesma coleção sem gerar esquemas com colunas nulas. O módulo **Match Center** lê estes documentos para renderizar mapas de calor e atualizar o marcador dinamicamente.

---

## Stack Tecnológica:

* **Backend:** Python 3.10+, FastAPI, Uvicorn, Psycopg2, PyMongo.
* **Frontend:** HTML5, JavaScript Vanilla (Canvas API para mapas táticos), Tailwind CSS.
* **Infraestrutura Cloud:** Google Cloud Platform (PostgreSQL) e MongoDB Atlas.

---

## Instruções de Execução:

Siga os passos abaixo para testar a aplicação localmente. 

### 1. Pré-requisitos
Certifique-se de ter o Python 3 instalado. Clone este repositório e instale as dependências:

```bash
git clone https://[seu-repositorio]/bovoscore.git
cd bovoscore
pip install -r requirements.txt
