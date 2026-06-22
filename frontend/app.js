const API_BASE = "http://127.0.0.1:8000/api";
let currentEventsData = []; 
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

    fetch(`${API_BASE}/match/${matchId}`)
        .then(res => res.json())
        .then(data => {
            document.getElementById("homeTeam").innerText = data.home_team;
            document.getElementById("awayTeam").innerText = data.away_team;
            currentTeams.homeName = data.home_team;
            currentTeams.awayName = data.away_team;
        }).catch(err => console.log("Postgres sem dados:", err));

    fetch(`${API_BASE}/match/${matchId}/allevents`)
        .then(res => res.json())
        .then(events => {
            currentEventsData = events; 
            processNoSQLData(events);
        });
}

function processNoSQLData(events) {
    let homeGoals = 0; let awayGoals = 0;
    let homeXG = 0.0; let awayXG = 0.0;
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
        document.getElementById("homeTeam").innerText = firstEvent.team.name;
    }

    if (inferredTeams.length > 1) {
        currentTeams.awayName = inferredTeams.find(teamName => teamName !== currentTeams.homeName) || currentTeams.awayName;
    }
    document.getElementById("awayTeam").innerText = currentTeams.awayName;

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
            let xg = event.shot.statsbomb_xg || 0;
            if (isHome) homeXG += xg; else awayXG += xg;

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
    document.getElementById("homeXG").innerText = `(${homeXG.toFixed(2)} xG)`;
    document.getElementById("awayXG").innerText = `(${awayXG.toFixed(2)} xG)`;

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

    document.getElementById("mapFilter").value = "xg_home";
    renderActiveMap();
}

function drawFootballPitch(ctx, canvasWidth, canvasHeight) {
    ctx.fillStyle = "#2e7d32"; 
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const totalStripes = 18;
    const stripeWidth = canvasWidth / totalStripes;
    ctx.fillStyle = "#388e3c";
    for (let i = 0; i < totalStripes; i++) {
        if (i % 2 === 0) ctx.fillRect(i * stripeWidth, 0, stripeWidth, canvasHeight);
    }

    const offsetX = 26; const offsetY = 16;
    const fieldW = canvasWidth - (offsetX * 2);
    const fieldH = canvasHeight - (offsetY * 2);
    const halfW = canvasWidth / 2; const halfH = canvasHeight / 2;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, fieldW, fieldH);

    ctx.beginPath();
    ctx.moveTo(halfW, offsetY); ctx.lineTo(halfW, canvasHeight - offsetY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(halfW, halfH, fieldH * 0.15, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath();
    ctx.arc(halfW, halfH, 3, 0, 2 * Math.PI); ctx.fillStyle = "rgba(255, 255, 255, 0.6)"; ctx.fill();

    const penW = fieldW * 0.165; const penH = fieldH * 0.53; const penY = halfH - (penH / 2);
    ctx.strokeRect(offsetX, penY, penW, penH);
    ctx.strokeRect(canvasWidth - offsetX - penW, penY, penW, penH);

    const goalW = fieldW * 0.055; const goalH = fieldH * 0.24; const goalY = halfH - (goalH / 2);
    ctx.strokeRect(offsetX, goalY, goalW, goalH);
    ctx.strokeRect(canvasWidth - offsetX - goalW, goalY, goalW, goalH);

    const spotDist = fieldW * 0.11;
    ctx.beginPath(); ctx.arc(offsetX + spotDist, halfH, 2, 0, 2*Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(canvasWidth - offsetX - spotDist, halfH, 2, 0, 2*Math.PI); ctx.fill();

    const arcRadius = fieldH * 0.12;
    ctx.beginPath(); ctx.arc(offsetX + spotDist, halfH, arcRadius, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(canvasWidth - offsetX - spotDist, halfH, arcRadius, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
}

// Função auxiliar para desenhar setas de condução
function drawArrow(ctx, fromX, fromY, toX, toY, color) {
    const headlen = 8;
    const dx = toX - fromX; const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.lineTo(toX, toY);
    ctx.fillStyle = color;
    ctx.fill();
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
    drawFootballPitch(ctx, canvas.width, canvas.height);

    const offsetX = 26; const offsetY = 16;
    const activeWidth = canvas.width - (offsetX * 2);
    const activeHeight = canvas.height - (offsetY * 2);

    currentEventsData.forEach(event => {
        if (!event.location) return;
        
        const cx = offsetX + (event.location[0] / 120) * activeWidth;
        const cy = offsetY + (event.location[1] / 80) * activeHeight;
        const isHome = event.team.id === currentTeams.homeId;

        if (targetTeam === "home" && !isHome) return;
        if (targetTeam === "away" && isHome) return;

        // 1. CHUTES E EXPECTED GOALS (xG)
        if (action === "xg" && event.type.name === "Shot") {
            const isGoal = event.shot.outcome.name === "Goal";
            const xG = event.shot.statsbomb_xg || 0.05;
            const radius = Math.max(3, xG * 25); // O tamanho da bola depende da chance de gol

            const color = isHome ? (isGoal ? "#22c55e" : "rgba(30, 58, 138, 0.8)") : (isGoal ? "#facc15" : "rgba(161, 98, 7, 0.8)");
            
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "white";
            ctx.stroke();

            if (isGoal) {
                const playerName = event.player ? event.player.name.split(" ").slice(-1)[0] : "";
                ctx.save();
                ctx.font = "bold 11px Arial";
                ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.strokeText(playerName, cx + radius + 2, cy - 5);
                ctx.fillStyle = "#fff"; ctx.fillText(playerName, cx + radius + 2, cy - 5);
                ctx.restore();
            }
        }

        // 2. CONDUÇÕES DE BOLA (Carries)
        if (action === "carries" && event.type.name === "Carry" && event.carry) {
            const endX = offsetX + (event.carry.end_location[0] / 120) * activeWidth;
            const endY = offsetY + (event.carry.end_location[1] / 80) * activeHeight;
            // Só desenha conduções maiores que uma certa distância pra não poluir
            if (Math.abs(endX - cx) > 15 || Math.abs(endY - cy) > 15) {
                drawArrow(ctx, cx, cy, endX, endY, isHome ? "rgba(59, 130, 246, 0.7)" : "rgba(234, 179, 8, 0.7)");
            }
        }

        // 3. MAPA DE PRESSÃO
        if (action === "pressures" && event.type.name === "Pressure") {
            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
            ctx.fillStyle = isHome ? "rgba(239, 68, 68, 0.4)" : "rgba(249, 115, 22, 0.4)"; // Vermelho/Laranja transparente criando um 'heatmap' visual
            ctx.fill();
        }

        // 4. ERROS E PERDAS DE POSSE
        if (action === "turnovers" && ["Miscontrol", "Dispossessed"].includes(event.type.name)) {
            ctx.beginPath();
            ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx + 4, cy + 4);
            ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx - 4, cy + 4);
            ctx.strokeStyle = "red";
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        // 5. FLUXO DE PASSES (Todas as conexões certas)
        if (action === "passflow" && event.type.name === "Pass" && !event.pass.outcome) {
            const endX = offsetX + (event.pass.end_location[0] / 120) * activeWidth;
            const endY = offsetY + (event.pass.end_location[1] / 80) * activeHeight;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(endX, endY);
            // Opacidade muito baixa para vermos onde o fluxo é mais grosso
            ctx.strokeStyle = isHome ? "rgba(255, 255, 255, 0.08)" : "rgba(250, 204, 21, 0.08)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // MAPAS ANTERIORES: KEY PASSES E DEFENSE
        if (action === "key_passes" && event.type.name === "Pass" && (event.pass.shot_assist || event.pass.goal_assist)) {
            const endX = offsetX + (event.pass.end_location[0] / 120) * activeWidth;
            const endY = offsetY + (event.pass.end_location[1] / 80) * activeHeight;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(endX, endY);
            ctx.strokeStyle = event.pass.goal_assist ? "#4ade80" : "#60a5fa"; ctx.lineWidth = 2.5; ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
            ctx.fillStyle = event.pass.goal_assist ? "#22c55e" : "white"; ctx.fill(); ctx.strokeStyle = "#000"; ctx.stroke();

            if (event.pass.goal_assist) {
                const playerName = event.player ? event.player.name.split(" ").slice(-1)[0] : "Jogador";
                ctx.save(); ctx.font = "bold 12px Arial"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.fillStyle = "#ffffff";
                ctx.strokeText(playerName, cx + 8, cy - 8); ctx.fillText(playerName, cx + 8, cy - 8); ctx.restore();
            }
        }

        if (action === "defense" && ["Interception", "Duel", "Clearance"].includes(event.type.name)) {
            ctx.beginPath(); ctx.rect(cx - 4, cy - 4, 8, 8);
            ctx.fillStyle = isHome ? "rgba(59, 130, 246, 0.9)" : "rgba(234, 179, 8, 0.9)";
            ctx.strokeStyle = "white"; ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
        }
    });
}