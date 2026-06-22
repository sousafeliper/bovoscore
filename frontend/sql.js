const API_BASE = "http://127.0.0.1:8000/api";

document.addEventListener("DOMContentLoaded", loadTeams);

async function loadTeams() {
    const list = document.getElementById("teamsList");
    try {
        const res = await fetch(`${API_BASE}/explorer/teams`);
        const teams = await res.json();
        
        list.innerHTML = "";
        if (teams.error || teams.length === 0) {
            list.innerHTML = `<p class="text-red-400 p-4 text-sm">${teams.error || "Nenhum time encontrado."}</p>`;
            return;
        }

        teams.forEach(team => {
            const btn = document.createElement("button");
            btn.className = "w-full text-left p-3 rounded hover:bg-blue-600 focus:bg-blue-600 transition text-sm font-medium border border-transparent focus:border-blue-400 shadow-sm truncate text-slate-200";
            btn.innerHTML = `<i class="fa-solid fa-chevron-right mr-2 text-slate-500"></i> ${team.name}`;
            btn.onclick = () => loadPlayers(team.id, btn);
            list.appendChild(btn);
        });
    } catch (err) {
        list.innerHTML = `<p class="text-red-400 p-4 text-sm">Erro ao conectar na API.</p>`;
    }
}

async function loadPlayers(teamId, btnElement) {
    // Reset visual
    document.getElementById("playerProfile").innerHTML = '<div class="h-full flex items-center justify-center text-slate-500 text-sm">Selecione um jogador.</div>';
    
    const list = document.getElementById("playersList");
    list.innerHTML = '<p class="text-center text-slate-500 mt-10"><i class="fa-solid fa-circle-notch fa-spin"></i> Buscando elenco...</p>';

    try {
        const res = await fetch(`${API_BASE}/explorer/teams/${teamId}/players`);
        const players = await res.json();
        
        list.innerHTML = "";
        if (players.error || players.length === 0) {
            list.innerHTML = `<p class="text-slate-400 p-4 text-sm">Elenco não localizado.</p>`;
            return;
        }

        players.forEach(player => {
            const btn = document.createElement("button");
            btn.className = "w-full text-left p-3 rounded hover:bg-slate-700 focus:bg-slate-700 transition text-sm font-medium border border-slate-700 focus:border-slate-500 shadow-sm truncate text-slate-300";
            btn.innerHTML = `<i class="fa-regular fa-user mr-2 text-slate-500"></i> ${player.name}`;
            btn.onclick = () => loadPlayerProfile(player.id);
            list.appendChild(btn);
        });
    } catch (err) {
        list.innerHTML = `<p class="text-red-400 p-4 text-sm">Erro ao conectar.</p>`;
    }
}

async function loadPlayerProfile(playerId) {
    const profile = document.getElementById("playerProfile");
    profile.innerHTML = '<p class="text-center text-slate-500 mt-10"><i class="fa-solid fa-circle-notch fa-spin"></i> Baixando perfil...</p>';

    try {
        const res = await fetch(`${API_BASE}/explorer/players/${playerId}`);
        const data = await res.json();
        
        if (data.error) {
            profile.innerHTML = `<p class="text-red-400 text-sm">${data.error}</p>`;
            return;
        }

        // Formata a data de nascimento (Vem do banco como string/timestamp)
        const birthDate = new Date(data.birthday).toLocaleDateString('pt-BR');

        profile.innerHTML = `
            <div class="text-center mb-6">
                <div class="w-24 h-24 bg-slate-700 rounded-full mx-auto mb-4 border-4 border-slate-600 flex items-center justify-center">
                    <i class="fa-solid fa-user text-4xl text-slate-400"></i>
                </div>
                <h2 class="text-xl font-bold text-white">${data.name}</h2>
                <p class="text-slate-400 text-sm">ID Interno: ${playerId}</p>
            </div>

            <div class="space-y-4">
                <div class="flex justify-between items-center bg-slate-900 p-3 rounded border border-slate-700">
                    <span class="text-slate-400 text-sm"><i class="fa-solid fa-calendar mr-2"></i>Nascimento</span>
                    <span class="text-white font-mono">${birthDate}</span>
                </div>
                <div class="flex justify-between items-center bg-slate-900 p-3 rounded border border-slate-700">
                    <span class="text-slate-400 text-sm"><i class="fa-solid fa-ruler-vertical mr-2"></i>Altura</span>
                    <span class="text-white font-mono">${data.height} cm</span>
                </div>
                <div class="flex justify-between items-center bg-slate-900 p-3 rounded border border-slate-700">
                    <span class="text-slate-400 text-sm"><i class="fa-solid fa-weight-hanging mr-2"></i>Peso</span>
                    <span class="text-white font-mono">${data.weight} kg</span>
                </div>
            </div>
        `;
    } catch (err) {
        profile.innerHTML = `<p class="text-red-400 text-sm">Erro ao conectar.</p>`;
    }
}