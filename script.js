'use strict';
// ============================================================================
// CONFIGURAÇÃO FIREBASE E SEGURANÇA
// ============================================================================
const firebaseConfig = {
    apiKey: "AIzaSyCUwkGHLnSQBIiDhZN6MfF-R-RhZQx-kg4",
    authDomain: "sgc-logistica-eaa73.firebaseapp.com",
    databaseURL: "https://sgc-logistica-eaa73-default-rtdb.firebaseio.com",
    projectId: "sgc-logistica-eaa73",
    storageBucket: "sgc-logistica-eaa73.firebasestorage.app",
    messagingSenderId: "1028470597897",
    appId: "1:1028470597897:web:43406a082f45bf1e41cbd8",
    measurementId: "G-3Q4B4HLE65"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.database();

firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        db.ref('usuarios/' + user.uid).once('value').then((snapshot) => {
            const dados = snapshot.val();
            if (dados && dados.perfil) {
                const tagUser = document.getElementById('user-badge');
                if(tagUser) tagUser.innerText = dados.nome + " | " + dados.perfil.toUpperCase();
                aplicarPermissoes(dados.perfil);
                UI.init(); 
            } else {
                firebase.auth().signOut().then(() => window.location.href = "login.html");
            }
        });
    } else { window.location.href = "login.html"; }
});

function aplicarPermissoes(perfil) {
    window.userPerfil = perfil;
    const isComercial = perfil === 'comercial';
    ['btn-settings', 'btn-reset-data'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = isComercial ? 'none' : 'flex';
    });
}

// ============================================================================
// CONFIGURAÇÕES E ESTADO
// ============================================================================
const CONFIG = {
    drivers: {
        day: ["MARIO", "ADRIELSON", "MESSIAS", "MARCELO A", "JAMERSON", "MANSUETO", "JOAO VICTOR", "LUIZ CARLOS RODRIGUES", "JONES", "EMERSON", "MATHEUS", "JACKSON", "ROBERTO C", "RODRIGO", "CLOVIS", "JOELITON"],
        night: ["ELCIDES", "MARCONI", "LUIZ RODRIGO", "MAYKEL", "PLATINIS", "BRUNO"]
    },
    colors: ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#db2777', '#dc2626', '#0891b2', '#ea580c']
};

const State = {
    data: { routes: {}, addressBook: [], disposalPoints: [] }, 
    session: { currentDriver: null, shift: 'day', type: 'troca', routeDate: '' },
    tempQueue: [],
    isInitializing: true,

    init() {
        if (!this.session.routeDate) {
            const d = new Date();
            this.session.routeDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        UI.loading(true);
        db.ref('sgc_data').on('value', (snapshot) => {
            const val = snapshot.val() || {};
            this.data.addressBook = val.addressBook ? (Array.isArray(val.addressBook) ? val.addressBook : Object.values(val.addressBook)) : [];
            this.data.disposalPoints = val.disposalPoints ? (Array.isArray(val.disposalPoints) ? val.disposalPoints : Object.values(val.disposalPoints)) : [];
            this.data.routes = val.routes || {};
            this.integrityCheck();
            App.renderAll();
            if (this.isInitializing) { this.isInitializing = false; UI.loading(false); }
        });
    },

    getCurrentFleet() {
        if (!this.data.routes[this.session.routeDate]) this.data.routes[this.session.routeDate] = { fleet: {} };
        return this.data.routes[this.session.routeDate].fleet;
    },

    integrityCheck() {
        let changed = false;
        const fleet = this.getCurrentFleet();
        [...CONFIG.drivers.day, ...CONFIG.drivers.night].forEach((name, i) => {
            if (!fleet[name]) {
                fleet[name] = { trips: [], plate: '', color: CONFIG.colors[i % CONFIG.colors.length] };
                changed = true;
            } else if (!fleet[name].trips) { fleet[name].trips = []; }
        });
        if (changed && !this.isInitializing) this.saveFleet();
    },

    saveFleet() { db.ref('sgc_data/routes/' + this.session.routeDate + '/fleet').set(this.getCurrentFleet()); },
    
    addTrip(driverName, tripData) {
        const driver = this.getCurrentFleet()[driverName];
        if (!driver) return;
        tripData.id = Date.now() + Math.random();
        if (!tripData.status) tripData.status = 'pendente';
        driver.trips.push(tripData);
        this.saveFleet();
    }
};

// ============================================================================
// LÓGICA DE INTERFACE (UI)
// ============================================================================
const UI = {
    init() {
        State.init();
        const dateInput = document.getElementById('route-date');
        if(dateInput) dateInput.value = State.session.routeDate;
        this.toggleSection('planning');
        App.renderTriagem();
    },
    loading(show) { document.getElementById('loading-overlay').classList.toggle('hidden', !show); },
    toast(msg) {
        const c = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = "bg-slate-800 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-bold animate-fade-in";
        el.innerText = msg;
        c.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    },
    toggleSection(id) {
        ['planning', 'list', 'db'].forEach(s => {
            const el = document.getElementById(`section-${s}`);
            if(el) el.classList.toggle('hidden', s !== id);
        });
    },
    showPhoto(base64) {
        let modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4';
        modal.onclick = () => modal.remove();
        modal.innerHTML = `<img src="${base64}" class="max-w-full max-h-full rounded-lg shadow-2xl">`;
        document.body.appendChild(modal);
    }
};

// ============================================================================
// LÓGICA DO APLICATIVO (APP)
// ============================================================================
const App = {
    renderAll() {
        this.renderGrid();
        this.renderSpreadsheet();
        this.renderAddressBook();
        this.renderDisposalList();
        if (State.session.currentDriver) this.renderMiniHistory(State.session.currentDriver);
    },

    addRoute() {
        const raw = document.getElementById('input-dest').value;
        if (!raw) return UI.toast("Endereço vazio!");

        const novo = {
            empresa: document.getElementById('input-empresa').value,
            obra: document.getElementById('input-obra').value,
            qty: document.getElementById('input-qty').value,
            type: State.session.type,
            obs: document.getElementById('input-obs').value,
            to: { text: raw },
            status: 'pendente'
        };

        if (window.userPerfil === 'comercial') {
            db.ref('sgc_data/triagem_comercial').push(novo);
            UI.toast("Solicitação enviada!");
        } else {
            const name = State.session.currentDriver;
            if (!name) return UI.toast("Selecione um motorista!");
            State.addTrip(name, novo);
            UI.toast("Lançado direto!");
        }
        document.getElementById('input-dest').value = '';
        document.getElementById('input-obs').value = '';
    },

    renderTriagem() {
        const container = document.getElementById('triagem-list');
        if (!container) return;
        db.ref('sgc_data/triagem_comercial').on('value', (snap) => {
            container.innerHTML = '';
            const dados = snap.val();
            if (!dados) return container.innerHTML = '<div class="text-[10px] text-gray-400 p-2">Sem pedidos.</div>';
            Object.entries(dados).forEach(([id, p]) => {
                const div = document.createElement('div');
                div.className = "bg-orange-50 border border-orange-200 p-2 rounded mb-2 shadow-sm";
                div.innerHTML = `
                    <div class="flex justify-between text-[10px] font-bold text-orange-700">
                        <span>${p.type.toUpperCase()}</span>
                        <button onclick="App.removerDaTriagem('${id}')" class="text-gray-400 hover:text-red-500">×</button>
                    </div>
                    <div class="text-[11px] font-black">${p.empresa}</div>
                    <div class="mt-2 flex gap-1">
                        <select id="sel-${id}" class="text-[10px] border rounded flex-1">
                            <option value="">Motorista...</option>
                            ${[...CONFIG.drivers.day, ...CONFIG.drivers.night].map(d => `<option value="${d}">${d}</option>`).join('')}
                        </select>
                        <button onclick="App.enviarParaMotorista('${id}')" class="bg-blue-600 text-white px-2 rounded text-[10px]">OK</button>
                    </div>
                `;
                container.appendChild(div);
            });
        });
    },

    enviarParaMotorista(id) {
        const mot = document.getElementById(`sel-${id}`).value;
        if (!mot) return UI.toast("Selecione o motorista!");
        db.ref('sgc_data/triagem_comercial/' + id).once('value').then(s => {
            State.addTrip(mot, s.val());
            db.ref('sgc_data/triagem_comercial/' + id).remove();
            UI.toast("Enviado para " + mot);
        });
    },

    removerDaTriagem(id) { if(confirm("Remover?")) db.ref('sgc_data/triagem_comercial/' + id).remove(); },

    renderSpreadsheet() {
        const container = document.getElementById('spreadsheet-container');
        if (!container) return;
        container.innerHTML = '';
        State.getDriversByShift().forEach(name => {
            const d = State.getDriver(name);
            if(!d || !d.trips || d.trips.length === 0) return;
            const col = document.createElement('div');
            col.className = "min-w-[240px] flex flex-col bg-white border-r border-gray-200";
            col.innerHTML = `<div class="p-2 bg-slate-800 text-white text-center font-bold text-xs uppercase" style="border-bottom: 4px solid ${d.color}">${name}</div>`;
            const body = document.createElement('div');
            body.className = "flex-1 p-2 space-y-2 bg-gray-50 overflow-y-auto custom-scroll";
            d.trips.forEach((t, i) => {
                const isRepro = t.status === 'reprogramado';
                const isConcluido = t.status === 'concluido';
                const div = document.createElement('div');
                div.className = `p-3 rounded-lg border shadow-sm relative ${isRepro ? 'viagem-reprogramada' : (isConcluido ? 'bg-emerald-50 border-emerald-200' : 'bg-white')}`;
                
                const isAdmin = window.userPerfil === 'admin';
                const btns = isAdmin ? `
                    <div class="absolute top-2 right-2 flex gap-1">
                        <button onclick="App.reprogramarTrip('${name}', ${i})" class="w-5 h-5 rounded bg-orange-100 text-orange-600"><i class="fas fa-calendar-alt text-[8px]"></i></button>
                        <button onclick="App.setTripStatus('${name}', ${i}, 'concluido')" class="w-5 h-5 rounded bg-emerald-100 text-emerald-600"><i class="fas fa-check text-[8px]"></i></button>
                        <button onclick="App.deleteTrip('${name}', ${i})" class="w-5 h-5 rounded bg-red-50 text-red-400"><i class="fas fa-trash-alt text-[8px]"></i></button>
                    </div>
                ` : '';

                div.innerHTML = `
                    ${btns}
                    <div class="text-[9px] font-black text-blue-600 uppercase mb-1">${t.type} (${t.qty})</div>
                    <div class="text-[10px] font-bold text-gray-700">${t.empresa}</div>
                    <div class="text-xs font-black">${t.obra}</div>
                    ${t.foto ? `<button onclick="UI.showPhoto('${t.foto}')" class="mt-2 w-full py-1 bg-slate-700 text-white rounded text-[8px] font-bold uppercase">Ver Foto</button>` : ''}
                    ${isRepro ? `<div class="label-reprogramado">REPROGRAMADO: ${t.data_reprogramada}</div>` : ''}
                `;
                body.appendChild(div);
            });
            col.appendChild(body);
            if (window.userPerfil === 'admin') {
                const foot = document.createElement('div');
                foot.className = "p-2 border-t";
                foot.innerHTML = `<button onclick="App.shareDriverRoute('${name}')" class="w-full bg-green-600 text-white py-2 rounded text-[10px] font-bold">ENVIAR WHATSAPP</button>`;
                col.appendChild(foot);
            }
            container.appendChild(col);
        });
    },

    renderGrid() {
        const el = document.getElementById('drivers-grid');
        if(!el) return;
        el.innerHTML = '';
        State.getDriversByShift().forEach(name => {
            const d = State.getDriver(name);
            const card = document.createElement('div');
            card.className = "driver-card";
            card.onclick = () => App.openEditor(name);
            card.innerHTML = `
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style="background:${d.color}">${name[0]}</div>
                    <div class="flex-1 truncate text-xs font-bold">${name}</div>
                </div>`;
            el.appendChild(card);
        });
    },

    renderMiniHistory(name) {
        const el = document.getElementById('mini-history');
        if(!el) return;
        el.innerHTML = '';
        const driver = State.getDriver(name);
        if(!driver || !driver.trips) return;
        driver.trips.slice().reverse().forEach((t, i) => {
            const realIndex = driver.trips.length - 1 - i;
            const div = document.createElement('div');
            div.className = "p-2 bg-white border rounded mb-1 text-[10px] flex justify-between items-center";
            div.innerHTML = `<span>${t.empresa} - ${t.obra}</span>`;
            if(window.userPerfil === 'admin') {
                div.innerHTML += `<button onclick="App.deleteTrip('${name}', ${realIndex})" class="text-red-400">×</button>`;
            }
            el.appendChild(div);
        });
    },

    openEditor(name) {
        State.session.currentDriver = name;
        document.getElementById('editor-panel').classList.remove('hidden');
        document.getElementById('editor-driver-name').innerText = name;
        this.renderMiniHistory(name);
    },

    reprogramarTrip(name, index) {
        const data = prompt("Reprogramar para quando?");
        if (data) {
            const t = State.getDriver(name).trips[index];
            t.status = 'reprogramado';
            t.data_reprogramada = data;
            State.saveFleet();
        }
    },

    setTripStatus(name, i, s) {
        const d = State.getDriver(name);
        if(!d || !d.trips[i]) return;
        d.trips[i].status = s;
        State.saveFleet();
    },

    deleteTrip(name, i) {
        if(confirm("Apagar?")) {
            State.getDriver(name).trips.splice(i, 1);
            State.saveFleet();
        }
    },

    shareDriverRoute(name) {
        const d = State.getDriver(name);
        const trips = d.trips.filter(t => t.status !== 'concluido');
        if(trips.length === 0) return UI.toast("Sem rotas pendentes.");
        let msg = `*ROTA: ${name}*\n------------------\n`;
        trips.forEach(t => msg += `- ${t.type.toUpperCase()}: ${t.empresa} (${t.obra})\n`);
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
    },

    initDBForm() {}, 
    renderAddressBook() {},
    renderDisposalList() {},
    selectType(t) { State.session.type = t; }
};

window.onload = () => {};
