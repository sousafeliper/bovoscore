const API_BASE = "http://127.0.0.1:8000/api";
let currentEventsData = []; // Variável global para armazenar os lances sem precisar baixar de novo
let currentTeams = { homeId: 220, awayId: null, homeName: "Real Madrid", awayName: "Visitante" };

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch(`${API_BASE}/matches`);
        const matches = await response.json();
        const matchList = document.getElementById("matchList");
        
        matches.forEach(match => {
            const li = document.createElement("li");
            li.innerHTML = `
                <button onclick="loadMatchData(${match.id})" class="w-full text-left bg-slate-700 hover:bg-blue-600 focus:bg-blue-600 focus:ring-2 transition p-3 rounded text-sm font-medium border border-slate-600 shadow-sm truncate">
                    <i class="fa-regular fa-futbol mr-2 text-slate-400"></i>${match.title}
                </button>`;
            matchList.appendChild(li);
        });
    } catch (error) { console.error("Erro ao carregar partidas:", error); }
});

async function searchPlayer() {
    const term = document.getElementById("searchInput").value;
    if (term.length < 3) return;
    const resDiv = document.getElementById("searchResults");
    resDiv.innerHTML = '<p class="text-xs text-slate-400 animate-pulse">Buscando no SQL...</p>';

    try {
        const response = await fetch(`${API_BASE}/search/players?name=${term}`);
        const players = await response.json();
        resDiv.innerHTML = '';
        if (players.error || players.length === 0) {
            resDiv.innerHTML = '<p class="text-xs text-red-400">Nenhum jogador encontrado.</p>';
            return;
        }
        players.forEach(p => {
            resDiv.innerHTML += `
                <div class="bg-slate-700 p-2 rounded text-xs border border-slate-500 shadow-sm">
                    <strong class="text-blue-300 text-sm">${p.name}</strong><br>
                    <span class="text-slate-300">Altura: ${p.height}cm | Peso: ${p.weight}kg</span>
                </div>`;
        });
    } catch (error) { console.error("Erro na busca", error); }
}

async function loadMatchData(matchId) {
    document.getElementById("welcomeScreen").classList.add("hidden");
    document.getElementById("matchHeader").classList.remove("hidden");
    document.getElementById("matchDashboard").classList.remove("hidden");

    const ctx = document.getElementById("pitch").getContext("2d");
    ctx.clearRect(0, 0, 650, 417);
    document.getElementById("statEvents").innerText = "Carregando...";

    // Consome Banco Relacional para pegar nomes dos times
    fetch(`${API_BASE}/match/${matchId}`)
        .then(res => res.json())
        .then(data => {
            document.getElementById("homeTeam").innerText = data.home_team;
            document.getElementById("awayTeam").innerText = data.away_team;
            currentTeams.homeName = data.home_team;
            currentTeams.awayName = data.away_team;
        }).catch(err => console.log("Postgres sem dados:", err));

    // Consome Mongo para puxar os eventos
    fetch(`${API_BASE}/match/${matchId}/allevents`)
        .then(res => res.json())
        .then(events => {
            currentEventsData = events; // Salva globalmente
            processNoSQLData(events);
        });
}

function processNoSQLData(events) {
    let homeGoals = 0; let awayGoals = 0;
    let passes = 0; let completedPasses = 0; let shots = 0;
    let startingXI = { home: [], away: [] };

    const firstEvent = Array.isArray(events) && events.length > 0 ? events[0] : null;
    const inferredTeams = Array.from(new Set(
        (Array.isArray(events) ? events : [])
            .map(event => event && event.team && event.team.name)
            .filter(Boolean)
    ));

    if (firstEvent && firstEvent.team && firstEvent.team.name) {
        currentTeams.homeName = firstEvent.team.name;
        const homeTeamElement = document.getElementById("homeTeam");
        if (homeTeamElement) homeTeamElement.innerText = firstEvent.team.name;
    }

    if (inferredTeams.length > 1) {
        currentTeams.awayName = inferredTeams.find(teamName => teamName !== currentTeams.homeName) || currentTeams.awayName;
    }

    const awayTeamElement = document.getElementById("awayTeam");
    if (awayTeamElement) awayTeamElement.innerText = currentTeams.awayName;

    events.forEach(event => {
        if (!event.type) return;
        
        const isHome = event.team.id === currentTeams.homeId;
        
        if (!isHome && !currentTeams.awayId) currentTeams.awayId = event.team.id;

        if (event.type.name === "Starting XI") {
            if (isHome) startingXI.home = event.tactics.lineup;
            else startingXI.away = event.tactics.lineup;
        }

        if (event.type.name === "Pass") {
            passes++;
            if (!event.pass.outcome) completedPasses++;
        }

        if (event.type.name === "Shot") {
            shots++;
            if (event.shot.outcome.name === "Goal") {
                if (isHome) homeGoals++; else awayGoals++;
            }
        }
        
        if (event.type.name === "Own Goal Against") {
            if (isHome) awayGoals++; else homeGoals++;
        }
    });

    document.getElementById("homeScore").innerText = homeGoals;
    document.getElementById("awayScore").innerText = awayGoals;
    document.getElementById("statEvents").innerText = events.length;
    document.getElementById("statShots").innerText = shots;
    document.getElementById("statPasses").innerText = passes;
    document.getElementById("statPassAcc").innerText = passes > 0 ? ((completedPasses / passes) * 100).toFixed(1) + "%" : "0%";

    const renderXI = (ulId, lineup, colorClass) => {
        const ul = document.getElementById(ulId);
        ul.innerHTML = "";
        lineup.forEach(p => {
            ul.innerHTML += `
                <li class="flex justify-between items-center hover:bg-slate-600 transition p-1.5 rounded cursor-pointer" onclick="document.getElementById('searchInput').value='${p.player.name}'; searchPlayer();">
                    <span class="text-white truncate pr-2">${p.player.name}</span>
                    <span class="${colorClass} font-bold px-2 py-0.5 rounded shadow">${p.jersey_number}</span>
                </li>`;
        });
    };
    renderXI("startingXIHome", startingXI.home, "bg-blue-600 text-white");
    renderXI("startingXIAway", startingXI.away, "bg-yellow-600 text-slate-900");

    document.getElementById("mapFilter").value = "shots_home";
    renderActiveMap();
}

// ---- FUNÇÃO PARA DESENHAR O CAMPO DE FUTEBOL REAL NO CANVAS ----
function drawFootballPitch(ctx, canvasWidth, canvasHeight) {
    // 1. Gramado Base Escuro
    ctx.fillStyle = "#2e7d32"; 
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. Faixas de Grama (Listras)
    const totalStripes = 18;
    const stripeWidth = canvasWidth / totalStripes;
    ctx.fillStyle = "#388e3c"; // Verde um pouco mais claro
    for (let i = 0; i < totalStripes; i++) {
        if (i % 2 === 0) {
            ctx.fillRect(i * stripeWidth, 0, stripeWidth, canvasHeight);
        }
    }

    // 3. Marcações Brancas (Linhas)
    const offsetX = 26;
    const offsetY = 16;
    const fieldW = canvasWidth - (offsetX * 2);
    const fieldH = canvasHeight - (offsetY * 2);
    const halfW = canvasWidth / 2;
    const halfH = canvasHeight / 2;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 2;

    // Linhas Laterais e Fundo
    ctx.strokeRect(offsetX, offsetY, fieldW, fieldH);

    // Linha de Meio Campo
    ctx.beginPath();
    ctx.moveTo(halfW, offsetY);
    ctx.lineTo(halfW, canvasHeight - offsetY);
    ctx.stroke();

    // Círculo Central
    const circleRadius = fieldH * 0.15;
    ctx.beginPath();
    ctx.arc(halfW, halfH, circleRadius, 0, 2 * Math.PI);
    ctx.stroke();

    // Ponto Central
    ctx.beginPath();
    ctx.arc(halfW, halfH, 3, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fill();

    // Grandes Áreas (Penalty Area)
    const penW = fieldW * 0.165;
    const penH = fieldH * 0.53;
    const penY = halfH - (penH / 2);
    ctx.strokeRect(offsetX, penY, penW, penH); // Esquerda
    ctx.strokeRect(canvasWidth - offsetX - penW, penY, penW, penH); // Direita

    // Pequenas Áreas (Goal Area)
    const goalW = fieldW * 0.055;
    const goalH = fieldH * 0.24;
    const goalY = halfH - (goalH / 2);
    ctx.strokeRect(offsetX, goalY, goalW, goalH); // Esquerda
    ctx.strokeRect(canvasWidth - offsetX - goalW, goalY, goalW, goalH); // Direita

    // Gols (Redes fora do campo)
    const netW = 10;
    const netH = fieldH * 0.12;
    const netY = halfH - (netH / 2);
    ctx.strokeRect(offsetX - netW, netY, netW, netH); // Esquerda
    ctx.strokeRect(canvasWidth - offsetX, netY, netW, netH); // Direita

    // Marcas de Pênalti
    const spotDist = fieldW * 0.11;
    ctx.beginPath(); ctx.arc(offsetX + spotDist, halfH, 2, 0, 2*Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(canvasWidth - offsetX - spotDist, halfH, 2, 0, 2*Math.PI); ctx.fill();

    // Meias-Luas (D-arcs)
    const arcRadius = fieldH * 0.12;
    // Meia-lua Esquerda
    ctx.beginPath();
    ctx.arc(offsetX + spotDist, halfH, arcRadius, -0.9, 0.9);
    ctx.stroke();
    // Meia-lua Direita
    ctx.beginPath();
    ctx.arc(canvasWidth - offsetX - spotDist, halfH, arcRadius, Math.PI - 0.9, Math.PI + 0.9);
    ctx.stroke();
}

// ---------------- LÓGICA DE MAPAS TÁTICOS ----------------
function renderActiveMap() {
    const filter = document.getElementById("mapFilter").value;
    const filterParts = filter.split("_");
    const targetTeam = filterParts.pop();
    const action = filterParts.join("_");
    const canvas = document.getElementById("pitch");
    const ctx = canvas.getContext("2d");
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Desenha o gramado realista antes dos eventos
    drawFootballPitch(ctx, canvas.width, canvas.height);

    currentEventsData.forEach(event => {
        if (!event.location) return;
        const offsetX = 26;
        const offsetY = 16;
        const activeWidth = canvas.width - (offsetX * 2);
        const activeHeight = canvas.height - (offsetY * 2);
        
        const cx = offsetX + (event.location[0] / 120) * activeWidth;
        const cy = offsetY + (event.location[1] / 80) * activeHeight;
        const isHome = event.team.id === currentTeams.homeId;

        if (targetTeam === "home" && !isHome) return;
        if (targetTeam === "away" && isHome) return;

        // MAPA 1: FINALIZAÇÕES (Shots)
        if (action === "shots" && event.type.name === "Shot") {
            const isGoal = event.shot.outcome.name === "Goal";
            const isHomeShot = isHome;
            
            // Cores mais escuras e opacas para facilitar visualização
            const missColor = isHomeShot ? "rgba(30, 58, 138, 0.95)" : "rgba(161, 98, 7, 0.95)"; // Azul escuro / Ocre escuro
            const missBorder = isHomeShot ? "#60a5fa" : "#facc15"; // Borda mais clara para contraste
            
            const goalFill = isHomeShot ? "rgba(34, 197, 94, 1)" : "rgba(250, 204, 21, 1)";
            const goalGlow = isHomeShot ? "rgba(34, 197, 94, 0.85)" : "rgba(250, 204, 21, 0.85)";
            const playerName = event.player && event.player.name ? event.player.name.split(" ").slice(-1)[0] : "";

            if (isGoal) {
                ctx.save();
                ctx.shadowBlur = 16;
                ctx.shadowColor = goalGlow;
                ctx.beginPath();
                ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
                ctx.fillStyle = goalFill;
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = "rgba(255,255,255,0.9)";
                ctx.stroke();
                ctx.restore();

                if (playerName) {
                    const textX = cx + 10;
                    const textY = cy - 10;
                    ctx.save();
                    ctx.font = "bold 11px Arial";
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = "#000";
                    ctx.fillStyle = "#fff";
                    ctx.strokeText(playerName, textX, textY);
                    ctx.fillText(playerName, textX, textY);
                    ctx.restore();
                }
            } else {
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, 5.5, 0, 2 * Math.PI); // Bolinha um pouco maior (5.5)
                ctx.fillStyle = missColor;
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = missBorder;
                ctx.stroke();
                ctx.restore();
            }
        }

        // MAPA 2: PASSES CHAVE E ASSISTÊNCIAS
        if (action === "key_passes" && event.type.name === "Pass" && (event.pass.shot_assist || event.pass.goal_assist)) {
            // Correção da conversão de escala do passe final
            const endX = offsetX + (event.pass.end_location[0] / 120) * activeWidth;
            const endY = offsetY + (event.pass.end_location[1] / 80) * activeHeight;

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = event.pass.goal_assist ? "#4ade80" : "#60a5fa"; // Verde = Assistência, Azul = Passe Chave
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Bolinha no ponto de origem
            ctx.beginPath();
            ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
            ctx.fillStyle = event.pass.goal_assist ? "#22c55e" : "white";
            ctx.fill();
            ctx.strokeStyle = "#000";
            ctx.stroke();

            // Se for assistência para gol, escreve o nome do jogador
            if (event.pass.goal_assist) {
                const playerName = event.player && event.player.name ? event.player.name.split(" ").slice(-1)[0] : "Jogador";
                ctx.save();
                ctx.font = "bold 12px Arial";
                ctx.lineWidth = 3;
                ctx.strokeStyle = "rgba(0,0,0,0.85)"; // Borda preta forte para legibilidade
                ctx.fillStyle = "#ffffff";
                
                // Texto levemente deslocado
                ctx.strokeText(playerName, cx + 8, cy - 8);
                ctx.fillText(playerName, cx + 8, cy - 8);
                ctx.restore();
            }
        }

        // MAPA 3: AÇÕES DEFENSIVAS (Desarmes e Interceptações)
        if (action === "defense" && ["Interception", "Duel", "Clearance"].includes(event.type.name)) {
            ctx.beginPath();
            ctx.rect(cx - 4, cy - 4, 8, 8); // Quadrados para defesa
            ctx.fillStyle = isHome ? "rgba(59, 130, 246, 0.9)" : "rgba(234, 179, 8, 0.9)";
            ctx.strokeStyle = "white";
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();
        }

        // MAPA 4: FALTAS COMETIDAS
        if (action === "fouls" && event.type.name === "Foul Committed") {
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy - 5);
            ctx.lineTo(cx + 5, cy + 5);
            ctx.moveTo(cx + 5, cy - 5);
            ctx.lineTo(cx - 5, cy + 5);
            ctx.strokeStyle = isHome ? "#ef4444" : "#f97316"; // Vermelho / Laranja
            ctx.lineWidth = 3.5;
            ctx.stroke();
        }
    });
}