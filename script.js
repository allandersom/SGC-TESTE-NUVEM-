'use strict';

// ============================================================================
// CHAVES DO FIREBASE 
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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
// ============================================================================

const CONFIG = {
    drivers: {
        day: ["MARIO", "ADRIELSON", "MESSIAS", "MARCELO A", "JAMERSON", "MANSUETO", "JOAO VICTOR", "LUIZ CARLOS RODRIGUES", "JONES", "EMERSON", "MATHEUS", "JACKSON", "ROBERTO C", "RODRIGO", "CLOVIS", "JOELITON"],
        night: ["ELCIDES", "MARCONI", "LUIZ RODRIGO", "MAYKEL", "PLATINIS", "BRUNO"]
    },
    colors: ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#db2777', '#dc2626', '#0891b2', '#ea580c']
};

const State = {
    data: { routes: {}, addressBook: [], disposalPoints: [], agendamentos: [] }, 
    session: { currentDriver: null, shift: 'day', type: 'troca', agendaType: 'troca', routeDate: '' },
    tempQueue: [],
    isInitializing: true,

    init() {
        if (!this.session.routeDate) {
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            this.session.routeDate = `${year}-${month}-${day}`;
        }
        
        UI.loading(true);

        db.ref('sgc_data').on('value', (snapshot) => {
            try {
                const val = snapshot.val() || {};
                
                if (val.fleet) {
                    if (!val.routes) val.routes = {};
                    if (!val.routes[this.session.routeDate]) val.routes[this.session.routeDate] = { fleet: val.fleet };
                    db.ref('sgc_data/routes/' + this.session.routeDate + '/fleet').set(val.fleet);
                    db.ref('sgc_data/fleet').remove();
                }

                this.data.addressBook = val.addressBook ? (Array.isArray(val.addressBook) ? val.addressBook : Object.values(val.addressBook)) : [];
                this.data.disposalPoints = val.disposalPoints ? (Array.isArray(val.disposalPoints) ? val.disposalPoints : Object.values(val.disposalPoints)) : [];
                this.data.agendamentos = val.agendamentos ? (Array.isArray(val.agendamentos) ? val.agendamentos : Object.values(val.agendamentos)) : [];
                this.data.routes = val.routes || {};

                this.integrityCheck();

                App.renderGrid();
                App.renderSpreadsheet(); 
                App.renderAddressBook();
                App.renderDisposalList();
                App.renderAgendaTab(); 
                App.renderAgendaPanel();
                
                if (this.session.currentDriver) {
                    App.renderMiniHistory(this.session.currentDriver);
                }
            } catch (err) {
                console.error("ERRO GRAVE:", err);
                UI.toast("Erro ao carregar", "error");
            } finally {
                if (this.isInitializing) {
                    this.isInitializing = false;
                    UI.loading(false);
                }
            }
        });
    },

    getCurrentFleet() {
        if (!this.data.routes) this.data.routes = {};
        if (!this.data.routes[this.session.routeDate]) {
            this.data.routes[this.session.routeDate] = { fleet: {} };
        }
        return this.data.routes[this.session.routeDate].fleet;
    },

    integrityCheck() {
        let changed = false;
        const fleet = this.getCurrentFleet();
        const all = [...CONFIG.drivers.day, ...CONFIG.drivers.night];
        all.forEach((name, i) => {
            if (!fleet[name]) {
                fleet[name] = { trips: [], plate: '', color: CONFIG.colors[i % CONFIG.colors.length] };
                changed = true;
            } else {
                if (!fleet[name].trips) {
                    fleet[name].trips = [];
                    changed = true;
                } else if (!Array.isArray(fleet[name].trips)) {
                    fleet[name].trips = Object.values(fleet[name].trips);
                    changed = true;
                }
            }
        });
        if (changed && !this.isInitializing) this.saveFleet();
    },

    saveAll() {
        if (this.isInitializing) return;
        const updates = {};
        updates['sgc_data/routes/' + this.session.routeDate + '/fleet'] = this.getCurrentFleet();
        updates['sgc_data/agendamentos'] = this.data.agendamentos;
        db.ref().update(updates);
    },

    saveFleet() {
        if (this.isInitializing) return;
        db.ref('sgc_data/routes/' + this.session.routeDate + '/fleet').set(this.getCurrentFleet());
    },
    saveAddressBook() {
        if (this.isInitializing) return;
        db.ref('sgc_data/addressBook').set(this.data.addressBook);
    },
    saveDisposal() {
        if (this.isInitializing) return;
        db.ref('sgc_data/disposalPoints').set(this.data.disposalPoints);
    },
    saveAgendamentos() {
        if (this.isInitializing) return;
        db.ref('sgc_data/agendamentos').set(this.data.agendamentos);
    },

    resetFleet() {
        if (!this.data.routes) this.data.routes = {};
        this.data.routes[this.session.routeDate] = { fleet: {} };
        this.integrityCheck();
        if (!this.isInitializing) this.saveFleet();
    },

    getDriver(name) { return this.getCurrentFleet()[name]; },
    getDriversByShift() { return this.session.shift === 'day' ? CONFIG.drivers.day : CONFIG.drivers.night; },

    addTrip(driverName, tripData) {
        const driver = this.getCurrentFleet()[driverName];
        if (!driver) return;
        tripData.id = Date.now() + Math.random();
        tripData.status = 'pendente';
        driver.trips.push(tripData);
        this.saveFleet();
    },

    removeTrip(driverName, index) {
        this.getCurrentFleet()[driverName].trips.splice(index, 1);
        this.saveFleet();
    },
    
    updateTripText(driverName, index, company, obra, obs) {
        const driver = this.getCurrentFleet()[driverName];
        if(driver && driver.trips[index]) {
            driver.trips[index].empresa = company;
            driver.trips[index].obra = obra;
            if (obs !== undefined) driver.trips[index].obs = obs;
            this.saveFleet();
        }
    },
    
    setTripStatus(driverName, index, status) {
        const driver = this.getCurrentFleet()[driverName];
        const trip = driver.trips[index];
        if (trip) {
            trip.status = trip.status === status ? 'pendente' : status;
            trip.completed = (trip.status === 'concluido');
            
            if (trip.status === 'concluido' || trip.status === 'nao_feito') {
                const agora = new Date();
                trip.horaConclusao = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else {
                trip.horaConclusao = null;
            }
            this.saveFleet();
        }
    },

    updateTripQty(driverName, index, newQty) {
        const driver = this.getCurrentFleet()[driverName];
        if(driver && driver.trips[index]) {
            const qty = parseInt(newQty);
            if(qty > 0) {
                driver.trips[index].qty = qty;
                this.saveFleet();
            }
        }
    },

    addDisposalPoint(name, address) {
        this.data.disposalPoints.push({ id: Date.now(), name, address });
        this.saveDisposal();
    },
    
    removeDisposalPoint(id) {
        this.data.disposalPoints = this.data.disposalPoints.filter(d => d.id !== id);
        this.saveDisposal();
    },

    updateDescarte(driverName, index, location) {
        const driver = this.getCurrentFleet()[driverName];
        if (driver && driver.trips[index]) {
            driver.trips[index].descarteLocal = location;
            this.saveFleet();
        }
    },

    updatePlate(driverName, plate) {
        this.getCurrentFleet()[driverName].plate = plate.toUpperCase();
        this.saveFleet();
    },

    addToAddressBook(company, name, address) {
        const safeName = (name || "Sem Nome").trim();
        const safeCompany = (company || "").trim();
        const exists = this.data.addressBook.find(i => i.name.toLowerCase() === safeName.toLowerCase() && i.company.toLowerCase() === safeCompany.toLowerCase());

        if (!exists) {
            this.data.addressBook.push({ id: Date.now(), company: safeCompany, name: safeName, address: address });
            this.saveAddressBook();
            return true; 
        }
        return false; 
    },
    
    removeFromAddressBook(id) {
        this.data.addressBook = this.data.addressBook.filter(item => item.id !== id);
        this.saveAddressBook();
    },

    addAgendamento(item) {
        this.data.agendamentos.push(item);
        this.saveAgendamentos();
    },

    removeAgendamento(id) {
        this.data.agendamentos = this.data.agendamentos.filter(a => a.id !== id);
        this.saveAgendamentos();
    },

    searchAddressBook(query) {
        if (!query) return [];
        const q = query.toLowerCase();
        return this.data.addressBook.filter(item => 
            (item.name && item.name.toLowerCase().includes(q)) || 
            (item.company && item.company.toLowerCase().includes(q))
        ).slice(0, 5);
    },
    
    updateTripType(driverName, index, newType) {
        const driver = this.getCurrentFleet()[driverName];
        if(driver && driver.trips[index]) {
            driver.trips[index].type = newType;
            this.saveFleet();
        }
    }
};

const WhatsappService = {
    generateShiftIcon(shift) { return shift === 'day' ? 'DIA' : 'NOITE'; },
    getPluralLabel(type, qty) {
        if(!type) return '';
        const q = parseInt(qty);
        const t = type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        let label = type.toUpperCase();
        if (t.includes('troca')) label = q > 1 ? 'TROCAS' : 'TROCA';
        if (t.includes('coloca')) label = q > 1 ? 'COLOCAÇÕES' : 'COLOCAÇÃO';
        if (t.includes('retira')) label = q > 1 ? 'RETIRADAS' : 'RETIRADA';
        if (t.includes('encher')) label = 'ENCHER';
        return label;
    },
    formatAddress(text) {
        if (!text) return "Endereço não informado";
        const matchParens = text.match(/\(([^)]+)\)$/);
        if (matchParens) {
            return matchParens[1];
        }
        return text.replace(/, Brasil$/i, ''); 
    },
    getFormattedDate() {
        if (State.session.routeDate) {
            const [y, m, d] = State.session.routeDate.split('-');
            return `${d}/${m}/${y}`;
        }
        return new Date().toLocaleDateString('pt-BR');
    },

    buildMessage(driverName, trips, shift, plate) {
        const date = this.getFormattedDate();
        const shiftTxt = this.generateShiftIcon(shift);
        const plateTxt = plate ? `*[${plate}]*` : '';
        
        let msg = `ROTA ${date} (${shiftTxt})\n`;
        msg += `MOTORISTA: *${driverName}* ${plateTxt}\n`;
        msg += `--------------------------------\n\n`;

        for (let i = 0; i < trips.length; i++) {
            const t = trips[i];
            if (t.obs) {
                const logObs = t.obs.replace(/\|? ?MOT:.*$/g, '').trim();
                if(logObs) msg += `*\`OBS: ${logObs.toUpperCase()}\`*\n`;
            }
            if (t.empresa) msg += `${t.empresa.toUpperCase()}\n`;

            let typeHeader = "";
            if (t.type === 'encher') {
                const q = t.qty;
                typeHeader = `${q} COLOCAÇÃO + ${q} RETIRADA`;
            } else {
                typeHeader = `${t.qty} ${this.getPluralLabel(t.type, t.qty)}`;
            }
            msg += `*${typeHeader}*\n`;
            if (t.obra) msg += `OBRA: ${t.obra.toUpperCase()}\n`;

            const addressText = typeof t.to === 'string' ? t.to : (t.to && t.to.text ? t.to.text : '');
            const displayEnd = this.formatAddress(addressText).toUpperCase();
            msg += `END: ${displayEnd}\n`;

            if (t.descarteLocal) msg += `*DESCARTE: ${t.descarteLocal.toUpperCase()}*\n`;
            if (t.mtr) msg += `\`${t.mtr}\`\n`;
            msg += `\n`; 
        }
        return msg;
    },

    shareGeneralSummary() {
        const shift = State.session.shift;
        const date = this.getFormattedDate();
        const shiftTxt = shift === 'day' ? 'DIA' : 'NOITE';
        let msg = `ROTA ${date} (${shiftTxt})\n`;
        msg += `========================\n\n`;
        
        let hasContent = false;
        const drivers = State.getDriversByShift();

        drivers.forEach(name => {
            const driver = State.getDriver(name);
            if(!driver || !driver.trips) return;
            const activeTrips = driver.trips.filter(t => t.status !== 'concluido' && t.status !== 'cancelado' && t.status !== 'nao_feito');
            
            if (activeTrips.length > 0) {
                hasContent = true;
                const plate = driver.plate ? `*[${driver.plate}]*` : '';
                msg += `>> *${name}* ${plate}\n`;
                
                for (let i = 0; i < activeTrips.length; i++) {
                    const t = activeTrips[i];
                    if(t.obs) {
                        const logObs = t.obs.replace(/\|? ?MOT:.*$/g, '').trim();
                        if(logObs) msg += `*\`OBS: ${logObs.toUpperCase()}\`*\n`;
                    }
                    if (t.empresa) msg += `${t.empresa.toUpperCase()}\n`;

                    let header = "";
                    if (t.type === 'encher') {
                        const q = t.qty;
                        header = `*${q} COLOCAÇÃO + ${q} RETIRADA*`;
                    } else {
                        header = `*${t.qty} ${this.getPluralLabel(t.type, t.qty)}*`;
                    }
                    msg += `${header}\n`;
                    if (t.obra) msg += `OBRA: ${t.obra.toUpperCase()}\n`;
                    
                    const addressText = typeof t.to === 'string' ? t.to : (t.to && t.to.text ? t.to.text : '');
                    msg += `END: ${this.formatAddress(addressText).toUpperCase()}\n`;
                    if(t.descarteLocal) msg += `*DESCARTE: ${t.descarteLocal.toUpperCase()}*\n`;
                    if (t.mtr) msg += `\`${t.mtr}\`\n`;
                    msg += `\n`;
                }
                msg += `------------------------\n`;
            }
        });

        if (hasContent) {
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
        } else {
            UI.toast("Nenhuma rota pendente para enviar.", "info");
        }
    }
};

const DataService = {
    export() {
        const blob = new Blob([JSON.stringify(State.data)], {type: 'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `SGC_Nuvem_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    },
    import(input) {
        const r = new FileReader();
        r.onload = e => { 
            try { 
                const importedData = JSON.parse(e.target.result); 
                State.data = importedData; 
                db.ref('sgc_data').set(State.data); 
                UI.toast("Backup enviado para a Nuvem com sucesso!");
                setTimeout(() => location.reload(), 1500);
            } catch { UI.toast("Arquivo inválido", "error"); }
        };
        if(input.files[0]) r.readAsText(input.files[0]);
    },
    reset() {
        if(confirm("Deseja iniciar um novo dia?\n\nISSO APAGARÁ TODAS AS ROTAS PARA TODO MUNDO, mas manterá os endereços salvos.")) {
            State.resetFleet();
        }
    }
};

const UI = {
    tempTripIndex: null,
    tempDriverName: null, 

    init() {
        State.init();
        const dateInput = document.getElementById('route-date');
        if(dateInput) dateInput.value = State.session.routeDate;
        this.toggleSection('planning');
        App.initDBForm();
        this.selectAgendaType('troca'); 
    },

    toggleSection(id) {
        ['planning', 'list', 'db', 'agenda'].forEach(s => {
            const el = document.getElementById(`section-${s}`);
            const arrow = document.getElementById(`arrow-${s}`);
            if (s === id) {
                if (el.classList.contains('hidden')) {
                    el.classList.remove('hidden');
                    if(arrow) arrow.style.transform = 'rotate(180deg)';
                } else {
                    el.classList.add('hidden');
                    if(arrow) arrow.style.transform = 'rotate(0deg)';
                }
            } else {
                el.classList.add('hidden');
                if(arrow) arrow.style.transform = 'rotate(0deg)';
            }
        });
    },

    toggleModal(id) { 
        const el = document.getElementById(id);
        if(el) el.classList.toggle('hidden'); 
    },

    toggleSpreadsheetAgenda() {
        const panel = document.getElementById('spreadsheet-agenda-panel');
        const content = document.getElementById('spreadsheet-agenda-content');
        const icon = document.getElementById('spreadsheet-agenda-icon');
        
        if (panel.classList.contains('w-80')) {
            panel.classList.replace('w-80', 'w-12');
            content.classList.add('hidden');
            icon.classList.replace('fa-chevron-left', 'fa-calendar-check');
            panel.querySelector('span > span').classList.add('hidden');
        } else {
            panel.classList.replace('w-12', 'w-80');
            content.classList.remove('hidden');
            icon.classList.replace('fa-calendar-check', 'fa-chevron-left');
            panel.querySelector('span > span').classList.remove('hidden');
        }
    },
    
    loading(show) { document.getElementById('loading-overlay').classList.toggle('hidden', !show); },

    toast(msg, type = 'success') {
        const c = document.getElementById('toast-container');
        if(!c) return;
        const el = document.createElement('div');
        const cls = type === 'success' ? 'bg-emerald-600' : (type === 'error' ? 'bg-red-500' : 'bg-blue-600');
        el.className = `${cls} text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 text-xs font-bold animate-fade-in border border-white/20 z-[9999]`;
        el.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
        c.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    },

    showPhoto(base64) {
        let modal = document.getElementById('photo-modal-viewer');
        if(!modal) {
            modal = document.createElement('div');
            modal.id = 'photo-modal-viewer';
            modal.className = 'fixed inset-0 z-[10009] bg-slate-900/95 flex items-center justify-center p-4 backdrop-blur-sm cursor-pointer animate-fade-in';
            modal.onclick = () => modal.remove();
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <img src="${base64}" class="max-w-full max-h-[80vh] rounded-xl shadow-2xl border-4 border-white object-contain">
            <div class="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-white font-black bg-red-600 px-6 py-3 rounded-full shadow-lg hover:bg-red-700 transition">
                <i class="fas fa-times mr-2"></i> FECHAR FOTO
            </div>
        `;
    },

    openEditor(name) {
        const d = State.getDriver(name);
        State.session.currentDriver = name;
        State.tempQueue = []; 
        App.renderQueue(); 
        
        document.getElementById('editor-panel').classList.remove('hidden');
        document.getElementById('editor-driver-name').innerText = name;
        document.getElementById('input-plate').value = d.plate || '';
        document.getElementById('input-empresa').value = '';
        document.getElementById('input-obra').value = '';
        document.getElementById('input-dest').value = '';
        document.getElementById('input-obs').value = ''; 
        document.getElementById('input-qty').value = '1';
        document.getElementById('form-single').classList.remove('hidden');

        this.selectType('troca');
        App.renderMiniHistory(name);
        setTimeout(() => document.getElementById('input-empresa').focus(), 100);
    },

    closeEditor() {
        State.session.currentDriver = null;
        document.getElementById('editor-panel').classList.add('hidden');
        document.getElementById('suggestions-box').classList.add('hidden');
        App.renderGrid();
    },

    selectType(t) {
        State.session.type = t;
        const types = ['troca', 'colocacao', 'retirada', 'encher'];
        types.forEach(type => {
            const btn = document.getElementById(`btn-type-${type}`);
            if(!btn) return;
            btn.className = 'type-sel transition-all duration-200 font-bold text-lg border text-slate-500 border-slate-200 hover:bg-slate-50';
            if (t === type) {
                if(type === 'troca') btn.className = 'type-sel active bg-slate-800 text-white border-slate-800 shadow-md scale-105';
                if(type === 'colocacao') btn.className = 'type-sel active bg-red-600 text-white border-red-600 shadow-md scale-105';
                if(type === 'retirada') btn.className = 'type-sel active bg-purple-600 text-white border-purple-600 shadow-md scale-105';
                if(type === 'encher') btn.className = 'type-sel active bg-amber-500 text-white border-amber-500 shadow-md scale-105';
            }
        });
    },

    selectAgendaType(t) {
        State.session.agendaType = t;
        const types = ['troca', 'colocacao', 'retirada', 'encher'];
        types.forEach(type => {
            const btn = document.getElementById(`btn-agenda-${type}`);
            if(!btn) return;
            btn.className = 'agenda-type-sel transition-all duration-200 font-bold text-lg border text-slate-500 border-slate-200 hover:bg-slate-50 rounded-md';
            if (t === type) {
                if(type === 'troca') btn.className = 'agenda-type-sel active bg-slate-800 text-white border-slate-800 shadow-md scale-105 rounded-md';
                if(type === 'colocacao') btn.className = 'agenda-type-sel active bg-red-600 text-white border-red-600 shadow-md scale-105 rounded-md';
                if(type === 'retirada') btn.className = 'agenda-type-sel active bg-purple-600 text-white border-purple-600 shadow-md scale-105 rounded-md';
                if(type === 'encher') btn.className = 'agenda-type-sel active bg-amber-500 text-white border-amber-500 shadow-md scale-105 rounded-md';
            }
        });
    }
};

const App = {
    dragSource: null,

    initDBForm() {
        const dbSection = document.getElementById('section-db');
        if (!dbSection) return;
        const container = dbSection.querySelector('.space-y-2');
        if (container && !document.getElementById('db-company')) {
            const input = document.createElement('input');
            input.id = 'db-company';
            input.type = 'text';
            input.className = 'input-modern mb-2';
            input.placeholder = 'Empresa (Ex: Construtora X)';
            container.insertBefore(input, document.getElementById('db-name'));
        }
    },

    setRouteDate(dateString) {
        State.session.routeDate = dateString;
        State.integrityCheck();
        UI.closeEditor();
        this.renderGrid();
        this.renderSpreadsheet();
        this.renderAgendaPanel();
    },

    processSmartPaste() {
        const text = document.getElementById('paste-area').value;
        if (!text.trim()) return UI.toast("Cole o texto primeiro", "error");
        
        const driverName = State.session.currentDriver;
        if (!driverName) return UI.toast("Selecione um motorista", "error");

        const lines = text.split('\n');
        let count = 0, notFound = 0;

        for (let line of lines) {
            const query = line.trim();
            if(!query) continue;

            if (query.includes(':')) {
                const parts = query.split(':');
                const emp = parts[0].trim(), obr = parts[1].trim();
                
                const match = State.data.addressBook.find(item => 
                    (item.name && item.name.toLowerCase() === obr.toLowerCase()) ||
                    (item.company && item.company.toLowerCase() === emp.toLowerCase() && item.name && item.name.toLowerCase() === obr.toLowerCase())
                );

                const inputs = {
                    empresa: emp, obra: obr, qty: 1, type: State.session.type,
                    obs: match ? "" : "NÃO ACHOU NO BANCO",
                    to: { text: match ? match.address : "PREENCHER ENDEREÇO" },
                    mtr: null, descarteLocal: null, status: 'pendente', completed: false
                };
                State.addTrip(driverName, inputs);
                count++;
                if (!match) notFound++;

            } else {
                const queryLower = query.toLowerCase();
                const specificMatches = State.data.addressBook.filter(item => item.name && queryLower.includes(item.name.toLowerCase()));
                let finalMatches = specificMatches.length > 0 ? specificMatches : State.data.addressBook.filter(item => item.company && queryLower.includes(item.company.toLowerCase()));

                if (finalMatches.length > 0) {
                    finalMatches.forEach(match => {
                        State.addTrip(driverName, {
                            empresa: match.company || query, obra: match.name || '', qty: 1, type: State.session.type,
                            obs: "", to: { text: match.address }, mtr: null, descarteLocal: null, status: 'pendente', completed: false
                        });
                        count++;
                    });
                } else {
                    State.addTrip(driverName, {
                        empresa: query, obra: '', qty: 1, type: State.session.type,
                        obs: "NÃO ACHOU NO BANCO", to: { text: "PREENCHER ENDEREÇO" }, mtr: null, descarteLocal: null, status: 'pendente', completed: false
                    });
                    count++;
                    notFound++;
                }
            }
        }

        UI.toggleModal('paste-modal');
        document.getElementById('paste-area').value = '';
        UI.openEditor(driverName);
        if (notFound > 0) UI.toast(`${count} viagens adicionadas (${notFound} sem endereço no banco)`, "info");
        else UI.toast(`${count} viagens importadas com sucesso!`);
    },

    openDisposalModal(tripIndex) {
        const list = document.getElementById('select-disposal-list');
        list.innerHTML = '';
        State.data.disposalPoints.forEach(dp => {
            const btn = document.createElement('button');
            btn.className = "w-full text-left p-3 hover:bg-green-50 rounded border-b border-slate-50 text-xs font-bold text-slate-700 flex items-center";
            btn.innerHTML = `<i class="fas fa-map-marker-alt text-green-500 mr-2"></i>${dp.name} - ${dp.address}`;
            btn.onclick = () => {
                State.updateDescarte(State.session.currentDriver, tripIndex, dp.name);
                UI.toggleModal('select-disposal-modal');
            };
            list.appendChild(btn);
        });
        if(State.data.disposalPoints.length === 0) list.innerHTML = '<div class="text-center text-xs text-gray-400 p-4">Nenhum aterro cadastrado.</div>';
        UI.tempTripIndex = tripIndex;
        UI.toggleModal('select-disposal-modal');
    },

    clearTripDisposal() {
        State.updateDescarte(State.session.currentDriver, UI.tempTripIndex, null);
        UI.toggleModal('select-disposal-modal');
    },

    openMtrModal(tripIndex, driverName = null) { 
        UI.tempTripIndex = tripIndex; 
        UI.tempDriverName = driverName; 
        UI.toggleModal('select-mtr-modal'); 
    },

    confirmMtrSelection(mtrValue) {
        const driverName = UI.tempDriverName || State.session.currentDriver;
        const driver = State.getCurrentFleet()[driverName];
        if (driver && driver.trips[UI.tempTripIndex]) {
            driver.trips[UI.tempTripIndex].mtr = mtrValue;
            State.saveFleet();
            App.renderSpreadsheet(); 
        }
        UI.toggleModal('select-mtr-modal');
    },

    clearTripMtr() {
        const driverName = UI.tempDriverName || State.session.currentDriver;
        const driver = State.getCurrentFleet()[driverName];
        if (driver && driver.trips[UI.tempTripIndex]) {
            driver.trips[UI.tempTripIndex].mtr = null;
            State.saveFleet();
            App.renderSpreadsheet(); 
        }
        UI.toggleModal('select-mtr-modal');
    },

    addDisposalPoint() {
        const name = document.getElementById('new-aterro-name').value;
        const addr = document.getElementById('new-aterro-addr').value;
        if(!name) return UI.toast("Preencha o nome do aterro", "error");
        State.addDisposalPoint(name, addr || "Sem endereço salvo");
        document.getElementById('new-aterro-name').value = '';
        document.getElementById('new-aterro-addr').value = '';
        UI.toast("Aterro salvo com sucesso!");
    },

    renderDisposalList() {
        const el = document.getElementById('disposal-list');
        if(!el) return;
        el.innerHTML = '';
        State.data.disposalPoints.forEach(dp => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100";
            div.innerHTML = `<span class="text-xs font-bold text-slate-700">${dp.name}</span><button onclick="State.removeDisposalPoint(${dp.id})" class="text-red-400 hover:text-red-600"><i class="fas fa-trash"></i></button>`;
            el.appendChild(div);
        });
    },

    setShift(shift) {
        State.session.shift = shift;
        document.getElementById('shift-day').className = `shift-btn ${shift==='day'?'active':''}`;
        document.getElementById('shift-night').className = `shift-btn ${shift==='night'?'active':''}`;
        document.body.classList.toggle('night-mode', shift === 'night');
        UI.closeEditor();
        this.renderGrid();
        this.renderSpreadsheet();
    },

    updatePlate() {
        if(State.session.currentDriver) State.updatePlate(State.session.currentDriver, document.getElementById('input-plate').value);
    },

    handleAutocomplete(input, target = 'planning') {
        const val = input.value.toLowerCase();
        const boxId = target === 'agenda' ? 'suggestions-box-agenda' : 'suggestions-box';
        const box = document.getElementById(boxId);
        
        if (val.length < 2) return box.classList.add('hidden');

        const matches = State.searchAddressBook(val);
        if (matches.length > 0) {
            box.innerHTML = matches.map(item => {
                let cleanAddress = item.address
                    .replace(/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\s*/, '') 
                    .replace(/\s*\([^)]*\)$/, '') 
                    .replace(/, Brasil$/i, '') 
                    .trim();

                return `
                    <div class="suggestion-item" onclick="App.selectSuggestion('${item.company || ''}', '${item.name}', '${item.address}', '${target}')">
                        <div class="flex justify-between items-start mb-1">
                            <div class="flex flex-col">
                                <strong class="text-sm font-bold text-slate-800 uppercase tracking-tight">${item.name}</strong>
                                <span class="text-[10px] text-slate-400 font-medium uppercase mt-0.5">${item.company || 'Geral'}</span>
                            </div>
                            <i class="fas fa-plus text-slate-300 text-[10px] mt-1"></i>
                        </div>
                        <div class="text-[11px] text-slate-500 truncate leading-none">
                            <i class="fas fa-map-marker-alt text-red-400 mr-1 text-[9px]"></i> ${cleanAddress}
                        </div>
                    </div>
                `;
            }).join('');
            box.classList.remove('hidden');
        } else {
            box.classList.add('hidden');
        }
    },

    selectSuggestion(company, name, address, target = 'planning') {
        if (target === 'agenda') {
            document.getElementById('agenda-empresa').value = company;
            document.getElementById('agenda-obra').value = name;
            document.getElementById('agenda-addr').value = address;
            document.getElementById('agenda-addr').classList.add('bg-purple-50', 'border-purple-200');
            setTimeout(() => document.getElementById('agenda-addr').classList.remove('bg-purple-50', 'border-purple-200'), 1000);
            document.getElementById('suggestions-box-agenda').classList.add('hidden');
        } else {
            document.getElementById('input-empresa').value = company;
            document.getElementById('input-obra').value = name;
            document.getElementById('input-dest').value = address;
            document.getElementById('input-dest').classList.add('bg-blue-50', 'border-blue-200');
            setTimeout(() => document.getElementById('input-dest').classList.remove('bg-blue-50', 'border-blue-200'), 1000);
            document.getElementById('suggestions-box').classList.add('hidden');
        }
    },

    addRoute() {
        const name = State.session.currentDriver;
        if (!name) return;
        const raw = document.getElementById('input-dest').value;
        if (!raw) return UI.toast("Digite um endereço", "error");

        const inputs = {
            empresa: document.getElementById('input-empresa').value,
            obra: document.getElementById('input-obra').value,
            qty: document.getElementById('input-qty').value,
            type: State.session.type,
            obs: document.getElementById('input-obs').value,
            to: { text: raw },
            mtr: null, descarteLocal: null, status: 'pendente', completed: false
        };

        State.addTrip(name, inputs);
        if (inputs.obra || inputs.empresa) State.addToAddressBook(inputs.empresa, inputs.obra, raw);
        
        document.getElementById('input-dest').value = '';
        document.getElementById('input-obs').value = '';
        UI.openEditor(name);
        UI.toast("Adicionado!");
    },

    addToQueue() {
        const dest = document.getElementById('input-dest').value;
        if (!dest) return UI.toast("Preencha o endereço", "error");
        State.tempQueue.push({
            empresa: document.getElementById('input-empresa').value,
            obra: document.getElementById('input-obra').value,
            dest, qty: document.getElementById('input-qty').value,
            type: State.session.type, obs: document.getElementById('input-obs').value, mtr: null
        });
        document.getElementById('input-dest').value = '';
        document.getElementById('input-obs').value = '';
        document.getElementById('input-empresa').focus(); 
        this.renderQueue();
        UI.toast("Adicionado à fila!");
    },

    renderQueue() {
        const container = document.getElementById('queue-container');
        const list = document.getElementById('queue-list');
        list.innerHTML = '';
        document.getElementById('queue-count').innerText = State.tempQueue.length;

        if (State.tempQueue.length > 0) {
            container.classList.remove('hidden');
            State.tempQueue.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = "flex justify-between items-center text-[10px] bg-white p-1 rounded border border-blue-100";
                div.innerHTML = `<span class="truncate font-bold text-blue-800">${index+1}. ${item.empresa || 'Empresa'} - ${item.dest}</span>`;
                list.appendChild(div);
            });
        } else container.classList.add('hidden');
    },

    processQueue() {
        const name = State.session.currentDriver;
        if (!name || State.tempQueue.length === 0) return;
        for (const item of State.tempQueue) {
            State.addTrip(name, {
                empresa: item.empresa, obra: item.obra, qty: item.qty, type: item.type,
                obs: item.obs, to: { text: item.dest }, mtr: item.mtr || null, descarteLocal: null, status: 'pendente', completed: false
            });
            if (item.obra || item.empresa) State.addToAddressBook(item.empresa, item.obra, item.dest);
        }
        State.tempQueue = [];
        this.renderQueue();
        UI.toast("Fila processada com sucesso!");
    },

    addToAddressBook(company, name, address) {
        let c = company, n = name, a = address;
        let isManual = false;
        if (arguments.length === 0) {
            isManual = true;
            c = document.getElementById('db-company').value;
            n = document.getElementById('db-name').value;
            a = document.getElementById('db-addr').value;
        }
        if (State.addToAddressBook(c, n, a)) {
            if(isManual) {
                document.getElementById('db-company').value = '';
                document.getElementById('db-name').value = '';
                document.getElementById('db-addr').value = '';
                UI.toast("Salvo com sucesso!");
            }
            return true;
        } else {
            if(isManual) UI.toast("Já existe no banco", "info");
            return false;
        }
    },

    deleteFromAddressBook(id) {
        if(confirm("Remover este endereço?")) State.removeFromAddressBook(id);
    },

    renderAddressBook() {
        const el = document.getElementById('db-list');
        el.innerHTML = '';
        if(State.data.addressBook.length === 0) {
            el.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">Nenhum endereço salvo</div>';
            return;
        }
        State.data.addressBook.slice().reverse().forEach(item => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-white p-2 rounded border border-slate-100 shadow-sm";
            div.innerHTML = `
                <div class="flex-1 min-w-0 pr-2">
                    <div class="flex items-center gap-2">
                        <div class="font-bold text-xs text-slate-700 truncate">${item.name}</div>
                        ${item.company ? `<span class="text-[8px] bg-blue-50 text-blue-500 px-1 rounded uppercase">${item.company}</span>` : ''}
                    </div>
                    <div class="text-[9px] text-slate-400 truncate">${item.address}</div>
                </div>
                <button onclick="App.deleteFromAddressBook(${item.id})" class="text-slate-300 hover:text-red-500"><i class="fas fa-trash-alt"></i></button>
            `;
            el.appendChild(div);
        });
    },

    renderGrid() {
        const el = document.getElementById('drivers-grid');
        el.innerHTML = '';
        State.getDriversByShift().forEach(name => {
            const d = State.getDriver(name);
            if (!d) return; 
            const pending = d.trips ? d.trips.filter(t => !t.completed && t.status !== 'cancelado').length : 0;
            const card = document.createElement('div');
            card.className = `driver-card ${State.session.currentDriver===name ? 'selected' : ''}`;
            card.onclick = () => UI.openEditor(name);
            
            const plateHtml = d.plate ? `<div class="text-[8px] font-mono bg-slate-100 text-slate-500 rounded px-1 w-fit mt-1 border border-slate-200">${d.plate}</div>` : '';
            card.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm transition-transform hover:scale-110" style="background:${d.color}">${name.substring(0,2)}</div>
                    <div class="flex-1 min-w-0">
                        <div class="font-bold text-xs text-slate-700 truncate">${name}</div>
                        ${plateHtml}
                        <div class="text-[9px] ${pending?'text-blue-600 font-bold':'text-slate-400'} mt-0.5">${pending} pendentes</div>
                    </div>
                </div>`;
            el.appendChild(card);
        });
    },

    renderMiniHistory(name) {
        const el = document.getElementById('mini-history');
        el.innerHTML = '';
        const driver = State.getDriver(name);
        if(!driver || !driver.trips || driver.trips.length === 0) { el.innerHTML = '<div class="text-[9px] text-slate-300 text-center py-2">Sem viagens hoje</div>'; return; }
        
        driver.trips.slice().reverse().forEach((t, revIndex) => {
            const realIndex = driver.trips.length - 1 - revIndex;
            const row = document.createElement('div');
            row.className = "flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100 mb-1 animate-fade-in";
            
            let obsText = '';
            if(t.obs) {
                const logObs = t.obs.replace(/\|? ?MOT:.*$/g, '').trim();
                obsText = `<span class="text-[8px] ${t.obs.includes('MOT:') ? 'text-blue-600' : 'text-amber-600'} block italic line-clamp-1" title="${t.obs}">Obs: ${logObs}</span>`;
            }

            const companyTag = t.empresa ? `<span class="text-[7px] bg-slate-200 px-1 rounded mr-1">${t.empresa}</span>` : '';
            let displayType = t.type ? t.type.toUpperCase() : 'TROCA';
            if(t.type === 'encher') displayType = 'ENCHER'; 

            row.innerHTML = `
                <div class="truncate pr-2">
                    <div class="flex gap-1">
                        <button onclick="App.changeQty('${name}',${realIndex})" class="text-[9px] font-bold text-slate-700 hover:text-blue-600 border-b border-dotted border-slate-300 w-4 text-center" title="Mudar Qtd">${t.qty}</button>
                        <button onclick="App.cycleType('${name}',${realIndex})" class="text-[9px] font-bold text-slate-700 hover:text-blue-600 border-b border-dotted border-slate-300" title="Mudar Tipo">${displayType}</button>
                    </div>
                    <div class="text-[8px] text-slate-400 truncate">${companyTag}${t.obra || 'Sem nome'}</div>
                    ${obsText}
                </div>
                <button onclick="App.quickDelete('${name}', ${realIndex})" class="w-5 h-5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 flex items-center justify-center"><i class="fas fa-times text-xs"></i></button>
            `;
            el.appendChild(row);
        });
    },

    // 🔥 RENDER SPREADSHEET (TODOS OS MOTORISTAS APARECEM) 🔥
    renderSpreadsheet() {
        const container = document.getElementById('spreadsheet-container');
        if (!container) return; 
        container.innerHTML = '';

        const drivers = State.getDriversByShift();
        
        drivers.forEach(name => {
            const d = State.getDriver(name) || { plate: '', color: '#ccc', trips: [] };
            const trips = d.trips || [];
            
            const column = document.createElement('div');
            // 'h-full' adicionado para as colunas vazias não encolherem
            column.className = "driver-column min-w-[240px] max-w-[280px] flex flex-col bg-white snap-start border-r border-slate-300 transition-colors h-full";

            let totalServicos = 0;
            trips.forEach(t => {
                let qty = parseInt(t.qty) || 1;
                totalServicos += (t.type === 'encher') ? (qty * 2) : qty;
            });

            let headerHtml = `
                <div class="bg-slate-800 text-white text-center text-[10px] font-bold py-1">MOTORISTA</div>
                <div class="bg-yellow-300 text-center text-xs font-bold py-1 border-b border-slate-300 text-slate-800">${d.plate || 'SEM PLACA'}</div>
                <div class="text-center text-sm font-black py-2 uppercase tracking-wide bg-slate-50 border-b border-slate-200" style="color: ${d.color || '#333'};">${name}</div>
                <div class="bg-blue-600 text-white text-center text-[10px] font-bold py-1.5 shadow-sm">HOJE: ${totalServicos} SERVIÇOS</div>
            `;
            
            const bodyDiv = document.createElement('div');
            bodyDiv.className = "flex-1 flex flex-col bg-slate-100 overflow-y-auto custom-scroll p-2 gap-2 min-h-[150px]";
            bodyDiv.setAttribute('ondragover', 'App.handleDragOver(event)');
            bodyDiv.setAttribute('ondrop', `App.handleDrop(event, '${name}', -1)`);
            
            const buildCell = (t, i, colorClass, customLabel = null) => {
                let status = t.status || (t.completed ? 'concluido' : 'pendente');
                let bgClass = 'bg-white border-slate-200'; 
                let opacityClass = '';
                
                if (status === 'concluido') { bgClass = 'bg-emerald-50 border-emerald-300'; } 
                else if (status === 'cancelado') { bgClass = 'bg-slate-100 border-slate-300'; opacityClass = 'opacity-60 grayscale'; } 
                else if (status === 'nao_feito') { bgClass = 'bg-red-50 border-red-300'; }

                const label = customLabel || WhatsappService.getPluralLabel(t.type || 'troca', t.qty || 1);
                
                let obsHtml = '';
                if (t.obs) {
                    const parts = t.obs.split(/\|? ?MOT: /);
                    const logObs = parts[0].trim();
                    const motObs = parts[1] ? parts[1].trim() : '';

                    if (logObs) obsHtml += `<div class="mt-2 text-[10px] bg-amber-100 text-amber-900 font-bold rounded-lg p-1.5 border border-amber-300 break-words leading-tight"><i class="fas fa-exclamation-triangle"></i> LOG: ${logObs}</div>`;
                    if (motObs) obsHtml += `<div class="mt-1 text-[10px] bg-blue-100 text-blue-900 font-bold rounded-lg p-1.5 border border-blue-300 break-words leading-tight"><i class="fas fa-comment-dots"></i> MOT: ${motObs}</div>`;
                }

                const fotoTag = t.foto ? `<button onclick="UI.showPhoto('${t.foto}')" class="mt-2 w-full flex items-center justify-center gap-1 bg-slate-800 text-white font-bold rounded-lg py-1.5 text-[10px] shadow-sm hover:bg-black transition-colors"><i class="fas fa-camera"></i> VER FOTO COMPROVANTE</button>` : '';
                const mtrTag = t.mtr ? `<div class="mt-2 text-[10px] bg-indigo-100 text-indigo-900 font-bold rounded-lg p-1 border border-indigo-200 text-center truncate"><i class="fas fa-file-invoice"></i> ${t.mtr}</div>` : '';
                const descTag = t.descarteLocal ? `<div class="mt-1 text-[10px] bg-red-100 text-red-900 font-bold rounded-lg p-1 border border-red-200 text-center truncate">DESC: ${t.descarteLocal}</div>` : '';
                const timeTag = ((status === 'concluido' || status === 'nao_feito') && t.horaConclusao) ? `<div class="mt-2 text-[9px] font-black ${status==='concluido'?'text-emerald-700':'text-red-700'} text-center"><i class="far fa-clock"></i> ${status==='concluido'?'FEITO':'NÃO FEITO'} ÀS ${t.horaConclusao}</div>` : '';

                const barraAcoesHtml = `
                    <div class="mt-2 pt-2 border-t border-slate-200 flex gap-1 justify-between">
                        <button onclick="App.returnToAgenda('${name}', ${i})" class="text-[9px] bg-purple-50 hover:bg-purple-100 text-purple-700 px-2 py-1 rounded flex items-center gap-1 transition shadow-sm border border-purple-200 font-bold" title="Devolver p/ Agenda">
                            <i class="fas fa-undo"></i> <span class="hidden sm:inline">Agenda</span>
                        </button>
                        <div class="flex gap-1">
                            <button onclick="App.editObs('${name}', ${i})" class="text-[9px] bg-amber-50 hover:bg-amber-100 text-amber-700 px-2 py-1 rounded flex items-center gap-1 transition shadow-sm border border-amber-200 font-bold" title="Editar Observação">
                                <i class="fas fa-comment-dots"></i> OBS
                            </button>
                            <button onclick="App.openMtrModal(${i}, '${name}')" class="text-[9px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1 rounded flex items-center gap-1 transition shadow-sm border border-indigo-200 font-bold" title="Definir MTR">
                                <i class="fas fa-file-invoice"></i> MTR
                            </button>
                        </div>
                    </div>
                `;

                return `
                <div draggable="true" 
                     ondragstart="App.handleDriverDragStart(event, '${name}', ${i})"
                     ondrop="App.handleDrop(event, '${name}', ${i})"
                     class="drag-item p-3 border rounded-xl shadow-sm relative flex flex-col cursor-grab active:cursor-grabbing transition-all hover:border-blue-400 ${bgClass} ${opacityClass}">
                    
                    <div class="absolute top-2 right-2 flex gap-1">
                        <button onclick="App.setTripStatus('${name}', ${i}, 'concluido')" class="w-6 h-6 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center shadow-sm border border-emerald-200 transition" title="Marcar Concluído"><i class="fas fa-check text-[10px]"></i></button>
                        <button onclick="App.setTripStatus('${name}', ${i}, 'cancelado')" class="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center shadow-sm border border-slate-300 transition" title="Marcar Cancelado"><i class="fas fa-times text-[10px]"></i></button>
                    </div>

                    <div class="flex items-center gap-1 w-fit mb-2">
                        <button onclick="App.changeQty('${name}', ${i})" class="text-slate-600 hover:text-blue-600 hover:bg-blue-50 text-[10px] font-black bg-white rounded-md py-0.5 px-1.5 border border-slate-200 shadow-sm transition cursor-pointer" title="Mudar Quantidade">
                            ${t.qty || 1}
                        </button>
                        <button onclick="App.cycleType('${name}', ${i})" class="${colorClass} text-[10px] font-black bg-white hover:bg-slate-50 rounded-md py-0.5 px-2 border border-slate-200 shadow-sm transition cursor-pointer flex items-center gap-1" title="Clique para mudar o Tipo de Serviço">
                            ${label} <i class="fas fa-sync-alt opacity-40 hover:opacity-100 text-[8px]"></i>
                        </button>
                    </div>

                    <div class="font-bold text-[11px] leading-tight tracking-wide text-slate-800 pr-12 break-words">
                        ${t.empresa ? `<span class="text-slate-500 uppercase text-[9px]">${t.empresa}</span><br>` : ''}
                        ${t.obra ? `<span class="text-[13px] font-black">${t.obra}</span>` : ''}
                    </div>
                    
                    ${obsHtml}
                    ${mtrTag}
                    ${descTag}
                    ${fotoTag}
                    ${timeTag}
                    ${barraAcoesHtml}
                </div>`;
            };

            let tripsHtml = '';
            
            // Se a coluna estiver vazia, renderiza uma área de Drop pontilhada
            if (trips.length === 0) {
                tripsHtml = `
                    <div class="text-center text-slate-400 font-bold opacity-50 flex flex-col items-center justify-center h-full border-2 border-dashed border-slate-300 rounded-xl m-2 pointer-events-none">
                        <i class="fas fa-truck-loading text-2xl mb-2"></i>
                        <span class="text-[10px] uppercase tracking-wider">Arraste rotas<br>para cá</span>
                    </div>
                `;
            } else {
                trips.forEach((t, i) => {
                    if (t.type === 'troca') tripsHtml += buildCell(t, i, 'text-slate-800'); 
                    else if (t.type === 'colocacao') tripsHtml += buildCell(t, i, 'text-red-600'); 
                    else if (t.type === 'retirada') tripsHtml += buildCell(t, i, 'text-purple-600'); 
                    else if (t.type === 'encher') {
                        tripsHtml += buildCell(t, i, 'text-red-600', 'COLOCAÇÕES (ENCHER)');
                        tripsHtml += buildCell(t, i, 'text-purple-600', 'RETIRADAS (ENCHER)');
                    }
                });
            }

            bodyDiv.innerHTML = tripsHtml;

            const footerHtml = `
                <div class="mt-auto p-2 border-t border-slate-300 bg-white">
                    <button onclick="App.shareDriverRoute('${name}')" class="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-[11px] font-black rounded-lg shadow-sm flex items-center justify-center gap-2 transition transform hover:scale-[1.02] ${trips.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}" ${trips.length === 0 ? 'disabled' : ''}>
                        <i class="fab fa-whatsapp text-lg"></i> ENVIAR ROTA
                    </button>
                </div>
            `;

            column.innerHTML = headerHtml;
            column.appendChild(bodyDiv);
            column.insertAdjacentHTML('beforeend', footerHtml);
            
            container.appendChild(column);
        });
    },

    // ==========================================
    // 🔥 NOVO ARRASTAR E SOLTAR UNIFICADO 🔥
    // ==========================================
    
    handleAgendaDragStart(e, id) {
        this.dragSource = { type: 'agenda', id: id };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify(this.dragSource));
        setTimeout(() => e.target.classList.add('opacity-50'), 0);
    },

    handleDriverDragStart(e, driverName, index) {
        this.dragSource = { type: 'driver', driver: driverName, index: index };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify(this.dragSource));
        setTimeout(() => e.target.classList.add('opacity-50', 'bg-blue-50'), 0);
    },

    handleDragOver(e) {
        if (e.preventDefault) e.preventDefault(); 
        e.dataTransfer.dropEffect = 'move';
        
        const col = e.target.closest('.driver-column');
        if(col) col.classList.add('bg-blue-50/50');
        
        return false;
    },

    handleDrop(e, targetDriverName, targetIndex) {
        e.stopPropagation();
        e.preventDefault();
        
        document.querySelectorAll('.drag-item').forEach(el => el.classList.remove('opacity-50', 'bg-blue-50'));
        document.querySelectorAll('.driver-column').forEach(el => el.classList.remove('bg-blue-50/50'));

        const source = this.dragSource;
        if (!source) return false;

        const targetDriver = State.getCurrentFleet()[targetDriverName];
        if (!targetDriver.trips) targetDriver.trips = []; // Garante que tem onde dropar

        if (source.type === 'agenda') {
            const agendaItem = State.data.agendamentos.find(a => a.id === source.id);
            if(agendaItem) {
                const newTrip = {
                    empresa: agendaItem.empresa, obra: agendaItem.obra, qty: agendaItem.qty, type: agendaItem.type,
                    obs: agendaItem.obs, to: { text: agendaItem.address }, mtr: null, descarteLocal: null, status: 'pendente', completed: false
                };
                
                if (targetIndex === -1) {
                    State.addTrip(targetDriverName, newTrip);
                } else {
                    newTrip.id = Date.now() + Math.random();
                    targetDriver.trips.splice(targetIndex, 0, newTrip);
                }
                
                State.data.agendamentos = State.data.agendamentos.filter(a => a.id !== source.id);
                // Salva TUDO junto para evitar delays
                State.saveAll();
                
                App.renderSpreadsheet();
                App.renderAgendaPanel();
                App.renderGrid();
                UI.toast(`Agendamento atribuído a ${targetDriverName}!`);
            }
        } 
        else if (source.type === 'driver') {
            if (source.driver === targetDriverName && source.index === targetIndex) return false;
            
            const sourceDriver = State.getCurrentFleet()[source.driver];
            const movedItem = sourceDriver.trips.splice(source.index, 1)[0];
            
            if (targetIndex === -1) {
                targetDriver.trips.push(movedItem);
            } else {
                targetDriver.trips.splice(targetIndex, 0, movedItem);
            }
            State.saveFleet();
            App.renderSpreadsheet();
        }
        return false;
    },

    // ==========================================
    // 🔥 LÓGICA CORRIGIDA: DEVOLUÇÃO PRA AGENDA 🔥
    // ==========================================
    returnToAgenda(driverName, tripIndex) {
        if(!confirm("Devolver este serviço para os Agendamentos?")) return;
        
        const driver = State.getCurrentFleet()[driverName];
        if (!driver || !driver.trips || !driver.trips[tripIndex]) return;

        // Remove do motorista
        const trip = driver.trips.splice(tripIndex, 1)[0]; 

        // Recria o item na agenda com os dados exatos do card
        const agendaItem = {
            id: Date.now(),
            date: State.session.routeDate, // Volta pro dia atual que está selecionado na planilha
            empresa: trip.empresa || '',
            obra: trip.obra || '',
            address: typeof trip.to === 'string' ? trip.to : (trip.to && trip.to.text ? trip.to.text : ''),
            obs: trip.obs || '',
            qty: trip.qty || 1,
            type: trip.type || 'troca'
        };

        // Garante que o array existe
        if (!State.data.agendamentos) State.data.agendamentos = [];
        
        // Empurra pro array
        State.data.agendamentos.push(agendaItem);
        
        // 🔥 SALVA TUDO AO MESMO TEMPO PARA NÃO PERDER REFERÊNCIA 🔥
        State.saveAll();

        // Atualiza todas as telas
        this.renderSpreadsheet();
        this.renderAgendaPanel();
        this.renderAgendaTab();
        this.renderGrid();
        
        UI.toast("Serviço devolvido para a agenda!");
    },

    // ==========================================
    // 🔥 LÓGICA INTELIGENTE DE DISTRIBUIÇÃO 🔥
    // ==========================================
    autoDistributeAgenda() {
        const agendados = State.data.agendamentos.filter(a => a.date === State.session.routeDate);
        if (agendados.length === 0) return UI.toast("Nenhum agendamento para hoje.", "info");

        if(!confirm("Deseja que o sistema divida os serviços automaticamente?\n\nEle tentará manter a mesma obra com o mesmo motorista e balancear as quantidades.")) return;

        const groups = {};
        agendados.forEach(a => {
            const key = a.obra ? a.obra.toLowerCase().trim() : 'sem_obra_' + a.id;
            if (!groups[key]) groups[key] = [];
            groups[key].push(a);
        });

        const drivers = State.getDriversByShift();
        
        const driverLoads = drivers.map(name => {
            const d = State.getDriver(name);
            return { name, count: d && d.trips ? d.trips.length : 0 };
        });

        const sortedGroups = Object.values(groups).sort((a, b) => b.length - a.length);

        sortedGroups.forEach(group => {
            driverLoads.sort((a, b) => a.count - b.count);
            const targetDriver = driverLoads[0];

            group.forEach(a => {
                State.addTrip(targetDriver.name, {
                    empresa: a.empresa, obra: a.obra, qty: a.qty, type: a.type,
                    obs: a.obs, to: { text: a.address }, mtr: null, descarteLocal: null, status: 'pendente', completed: false
                });
                State.data.agendamentos = State.data.agendamentos.filter(ag => ag.id !== a.id);
                targetDriver.count++;
            });
        });

        State.saveAll();
        
        this.renderSpreadsheet();
        this.renderAgendaPanel();
        this.renderGrid();
        UI.toast("Serviços distribuídos inteligentemente!");
    },
    
    quickDelete(name, index) { if(confirm("Excluir viagem rápida?")) State.removeTrip(name, index); },
    deleteTrip(name, index) { if(confirm("Apagar esta entrega?")) State.removeTrip(name, index); },
    toggleStatus(n, i) { State.toggleTripStatus(n, i); },
    setTripStatus(n, i, s) { State.setTripStatus(n, i, s); },
    
    cycleType(name, index) {
        const d = State.getCurrentFleet()[name];
        if(!d || !d.trips[index]) return;
        const types = ['troca', 'colocacao', 'retirada', 'encher'];
        const current = d.trips[index].type;
        let nextIndex = types.indexOf(current) + 1;
        if (nextIndex >= types.length || nextIndex === -1) nextIndex = 0;
        State.updateTripType(name, index, types[nextIndex]);
    },
    
    editTripText(name, index) {
        const d = State.getCurrentFleet()[name];
        if(!d || !d.trips[index]) return;
        const currentCompany = d.trips[index].empresa || '';
        const currentObra = d.trips[index].obra || '';
        const currentObs = d.trips[index].obs || ''; 
        const newCompany = prompt("Editar Empresa:", currentCompany);
        if(newCompany === null) return; 
        const newObra = prompt("Editar Obra:", currentObra);
        if(newObra === null) return; 
        const newObs = prompt("Editar Observação:", currentObs.replace(/\|? ?MOT:.*$/g, '').trim());
        if (newObs === null) return;
        
        const parts = currentObs.split(/\|? ?MOT: /);
        const motObs = parts[1] ? ` | MOT: ${parts[1]}` : '';
        const finalObs = newObs ? `${newObs}${motObs}` : motObs.replace(' | ', '');

        State.updateTripText(name, index, newCompany, newObra, finalObs);
    },

    editTripAddress(name, index) {
        const d = State.getCurrentFleet()[name];
        if(!d || !d.trips[index]) return;
        const trip = d.trips[index];
        const currentAddr = (typeof trip.to === 'string' ? trip.to : (trip.to && trip.to.text ? trip.to.text : ''));
        const newAddr = prompt("Digite o endereço correto:", currentAddr === "PREENCHER ENDEREÇO" ? "" : currentAddr);
        if (newAddr !== null && newAddr.trim() !== "") {
            trip.to = { text: newAddr.trim() };
            if (trip.obs === "NÃO ACHOU NO BANCO") trip.obs = "";
            State.saveFleet();
            if (trip.empresa || trip.obra) State.addToAddressBook(trip.empresa, trip.obra, newAddr.trim());
            UI.toast("Endereço salvo na viagem e no banco!");
        }
    },
    
    editObs(name, index) {
        const d = State.getCurrentFleet()[name];
        const currentObs = d.trips[index].obs || '';
        const parts = currentObs.split(/\|? ?MOT: /);
        const logObs = parts[0].trim();
        const motObs = parts[1] ? ` | MOT: ${parts[1]}` : '';

        const newObs = prompt("Adicionar/Editar Observação (Logística):", logObs);
        if (newObs !== null) {
            d.trips[index].obs = newObs ? `${newObs}${motObs}` : motObs.replace(' | ', '');
            State.saveFleet();
            App.renderSpreadsheet(); 
            App.renderGrid();
        }
    },

    changeQty(name, index) {
        const d = State.getCurrentFleet()[name];
        if(!d || !d.trips[index]) return;
        const current = d.trips[index].qty;
        const newQty = prompt("Nova quantidade:", current);
        if(newQty !== null) State.updateTripQty(name, index, newQty);
    },

    setDescarte(n, i) { this.openDisposalModal(i); },

    shareDriverRoute(name) {
        const d = State.getCurrentFleet()[name];
        const active = d.trips.filter(t => t.status !== 'concluido' && t.status !== 'cancelado' && t.status !== 'nao_feito');
        if (!active.length) return UI.toast("Sem rotas pendentes", "info");
        let msg = WhatsappService.buildMessage(name, active, State.session.shift, d.plate);
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    },

    // Lógica Base do Agendamento
    addAgenda() {
        const date = document.getElementById('agenda-date').value;
        const empresa = document.getElementById('agenda-empresa').value;
        const obra = document.getElementById('agenda-obra').value;
        const addr = document.getElementById('agenda-addr').value;
        const obs = document.getElementById('agenda-obs').value;
        const qty = document.getElementById('agenda-qty').value;
        const type = State.session.agendaType || 'troca';

        if (!date) return UI.toast("Selecione a data do calendário acima!", "error");
        if (!addr && !obra) return UI.toast("Preencha a obra ou endereço", "error");

        State.addAgendamento({ id: Date.now(), date, empresa, obra, address: addr, obs, qty, type });

        // 🔥 SALVA NO BANCO DE ENDEREÇOS AUTOMATICAMENTE 🔥
        if (empresa || obra) {
            State.addToAddressBook(empresa, obra, addr);
        }

        document.getElementById('agenda-empresa').value = '';
        document.getElementById('agenda-obra').value = '';
        document.getElementById('agenda-addr').value = '';
        document.getElementById('agenda-obs').value = '';

        UI.toast("Serviço Agendado com sucesso!");
        this.renderAgendaTab();
        this.renderAddressBook(); // Atualiza a aba do banco de endereços visualmente
        
        if (date === State.session.routeDate) {
            this.renderAgendaPanel();
        }
    },

    renderAgendaTab() {
        const list = document.getElementById('agenda-tab-list');
        if(!list) return;
        const selectedDate = document.getElementById('agenda-date').value;

        list.innerHTML = '';
        if (!selectedDate) {
            list.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">Selecione uma data acima para ver os agendamentos</div>';
            return;
        }

        const agendados = State.data.agendamentos.filter(a => a.date === selectedDate);
        if (agendados.length === 0) {
            list.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">Nenhum serviço agendado para este dia</div>';
            return;
        }

        agendados.forEach(item => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-start bg-slate-50 p-3 rounded-lg border border-slate-200 shadow-sm animate-fade-in";
            
            const empresaTag = item.empresa ? `<span class="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded uppercase mr-1 border border-purple-200">${item.empresa}</span>` : '';
            const obsTag = item.obs ? `<div class="mt-1 text-[9px] bg-amber-100 text-amber-800 p-1 rounded font-bold">OBS: ${item.obs}</div>` : '';

            let typeColor = 'text-slate-800';
            if(item.type === 'colocacao') typeColor = 'text-red-600';
            if(item.type === 'retirada') typeColor = 'text-purple-600';
            if(item.type === 'encher') typeColor = 'text-amber-600';
            
            const label = WhatsappService.getPluralLabel(item.type || 'troca', item.qty || 1);

            div.innerHTML = `
                <div class="pr-2 flex-1 min-w-0">
                    <div class="flex items-center gap-1 mb-1">
                        <span class="text-[10px] font-black bg-slate-200 text-slate-700 px-1 rounded">${item.qty || 1}</span>
                        <span class="text-[10px] font-black ${typeColor}">${label}</span>
                    </div>
                    <div class="text-[11px] font-bold text-slate-800 truncate leading-tight">${empresaTag}${item.obra || 'Sem Nome'}</div>
                    <div class="text-[9px] text-slate-500 mt-1 leading-tight"><i class="fas fa-map-marker-alt text-red-400 mr-1"></i>${item.address || 'Sem endereço'}</div>
                    ${obsTag}
                </div>
                <button onclick="App.deleteAgenda(${item.id})" class="text-slate-300 hover:text-red-500 transition-colors shrink-0 ml-2 p-1"><i class="fas fa-trash-alt"></i></button>
            `;
            list.appendChild(div);
        });
    },

    renderAgendaPanel() {
        const list = document.getElementById('spreadsheet-agenda-list');
        if(!list) return;

        const agendadosHj = State.data.agendamentos.filter(a => a.date === State.session.routeDate);
        list.innerHTML = '';

        if(agendadosHj.length === 0) {
            list.innerHTML = '<div class="text-center text-xs text-purple-400 py-4 font-bold mt-10"><i class="far fa-smile text-2xl mb-2"></i><br>Nenhum agendamento pendente.</div>';
            return;
        }

        agendadosHj.forEach(a => {
            let colorClass = 'text-slate-800';
            if(a.type === 'colocacao') colorClass = 'text-red-600';
            if(a.type === 'retirada') colorClass = 'text-purple-600';
            if(a.type === 'encher') colorClass = 'text-amber-600';
            
            const label = WhatsappService.getPluralLabel(a.type || 'troca', a.qty || 1);

            list.innerHTML += `
            <div draggable="true" 
                 ondragstart="App.handleAgendaDragStart(event, ${a.id})"
                 class="drag-item p-3 border border-purple-200 rounded-xl shadow-sm bg-white flex flex-col relative animate-fade-in cursor-grab active:cursor-grabbing hover:border-purple-400 hover:shadow-md transition">
                <div class="flex items-center gap-1 w-fit mb-2">
                    <div class="text-slate-600 text-[10px] font-black bg-slate-100 rounded-md py-0.5 px-1.5 border border-slate-200">${a.qty || 1}</div>
                    <div class="${colorClass} text-[10px] font-black bg-slate-50 rounded-md py-0.5 px-2 border border-slate-200">${label}</div>
                </div>
                <div class="font-bold text-[11px] leading-tight tracking-wide text-slate-800 break-words">
                    ${a.empresa ? `<span class="text-slate-500 uppercase text-[9px]">${a.empresa}</span><br>` : ''}
                    <span class="text-[13px] font-black">${a.obra || 'Sem Nome'}</span>
                </div>
                <div class="text-[9px] text-slate-500 mt-1 leading-tight"><i class="fas fa-map-marker-alt text-red-400 mr-1"></i>${a.address}</div>
                ${a.obs ? `<div class="mt-2 text-[10px] bg-amber-100 text-amber-900 font-bold rounded-lg p-1.5 border border-amber-300"><i class="fas fa-exclamation-triangle"></i> OBS: ${a.obs}</div>` : ''}
            </div>`;
        });
    },

    deleteAgenda(id) {
        if(confirm("Deseja realmente excluir este agendamento?")) {
            State.removeAgendamento(id);
            this.renderAgendaTab();
            this.renderAgendaPanel();
            UI.toast("Agendamento removido");
        }
    }
};

window.onload = () => UI.init();
