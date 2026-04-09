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
        let clean = text.replace(/^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+\s*/g, '').trim();
        
        if (clean.startsWith('(') && clean.endsWith(')')) {
            clean = clean.substring(1, clean.length - 1).trim();
        } else if (clean.startsWith('(') && !clean.includes(')')) {
            clean = clean.substring(1).trim();
        }
        clean = clean.replace(/^END:\s*/i, '').replace(/,\s*Brasil$/i, '').trim();
        return clean || text;
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
            
            // 1. Logística / Empresa / Serviço
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

            // 2. Endereço e Dados Técnicos
            const addressText = typeof t.to === 'string' ? t.to : (t.to && t.to.text ? t.to.text : '');
            const displayEnd = this.formatAddress(addressText).toUpperCase();
            msg += `END: ${displayEnd}\n`;

            if (t.descarteLocal) msg += `*DESCARTE: ${t.descarteLocal.toUpperCase()}*\n`;
            if (t.mtr) msg += `\`${t.mtr}\`\n`;
            
            // 🔥 3. OBSERVAÇÃO EXTRA (ISOLADA SEM EMOJI E EM NEGRITO) 🔥
            if (t.obsExtra) {
                msg += `\n*ATENÇÃO: ${t.obsExtra.toUpperCase()}*\n`;
            }
            
            // Espaço final para o próximo serviço
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

                    // 🔥 OBSERVAÇÃO EXTRA NO RESUMO (SEM EMOJI) 🔥
                    if (t.obsExtra) {
                        msg += `\n*ATENÇÃO: ${t.obsExtra.toUpperCase()}*\n`;
                    }

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
    tempAgendaId: null,
    rescheduleSource: null,

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
        
        if (panel.classList.contains('panel-open')) {
            panel.classList.remove('panel-open', 'w-[45%]', 'md:w-80');
            panel.classList.add('w-12');
            content.classList.add('hidden');
            icon.classList.replace('fa-chevron-left', 'fa-calendar-check');
            panel.querySelector('span > span').classList.add('hidden');
        } else {
            panel.classList.remove('w-12');
            panel.classList.add('panel-open', 'w-[45%]', 'md:w-80');
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
        
        // 🔥 LÓGICA NOVA: Sincroniza os botões do menu antigo E da planilha nova 🔥
        document.querySelectorAll('#shift-day, .shift-day-sync').forEach(el => el.className = `shift-btn ${shift==='day'?'active':''} shift-day-sync text-xs px-3 py-1.5`);
        document.querySelectorAll('#shift-night, .shift-night-sync').forEach(el => el.className = `shift-btn ${shift==='night'?'active':''} shift-night-sync text-xs px-3 py-1.5`);
        
        document.body.classList.toggle('night-mode', shift === 'night');
        
        const shiftRadio = document.querySelector(`input[name="agenda-shift-sel"][value="${shift}"]`);
        if (shiftRadio) shiftRadio.checked = true;
        
        const mainLogo = document.getElementById('app-logo');
        if (mainLogo) {
            mainLogo.src = shift === 'night' ? 'images2.png' : 'images.png';
        }
        const favicon = document.querySelector("link[rel~='icon']");
        if (favicon) {
            favicon.href = shift === 'night' ? 'images2.png' : 'images.png';
        }

        UI.closeEditor();
        this.renderGrid();
        this.renderSpreadsheet();
        this.renderAgendaPanel(); 
        this.renderAgendaTab();   
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
                const cleanAddress = WhatsappService.formatAddress(item.address);
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
                    <div class="text-[9px] text-slate-400 truncate">${WhatsappService.formatAddress(item.address)}</div>
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

    renderSpreadsheet() {
        const container = document.getElementById('spreadsheet-container');
        if (!container) return; 
        container.innerHTML = '';

        const drivers = State.getDriversByShift();
        
        drivers.forEach(name => {
            const d = State.getDriver(name) || { plate: '', color: '#ccc', trips: [] };
            const trips = d.trips || [];
            
            const column = document.createElement('div');
            column.className = "driver-column shrink-0 min-w-[200px] sm:min-w-[230px] max-w-[260px] md:min-w-[280px] md:max-w-[340px] flex flex-col bg-slate-50 snap-start border-r border-slate-300 transition-colors h-full";

            let totalServicos = 0;
            trips.forEach(t => {
                let qty = parseInt(t.qty) || 1;
                totalServicos += (t.type === 'encher') ? (qty * 2) : qty;
            });

            let headerHtml = `
                <div class="bg-slate-800 text-white text-center text-[10px] font-bold py-1 shadow-sm">MOTORISTA</div>
                <div class="bg-yellow-300 text-center text-xs font-bold py-1 border-b border-slate-300 text-slate-800 tracking-wider">${d.plate || 'SEM PLACA'}</div>
                <div class="text-center text-sm font-black py-2.5 uppercase tracking-wide bg-white border-b border-slate-200" style="color: ${d.color || '#333'};">${name}</div>
                <div class="bg-blue-600 text-white text-center text-[10px] font-bold py-1.5 shadow-sm">HOJE: ${totalServicos} SERVIÇOS</div>
            `;
            
            const bodyDiv = document.createElement('div');
            bodyDiv.className = "flex-1 flex flex-col overflow-y-auto custom-scroll p-2 gap-2 min-h-[150px]";
            bodyDiv.setAttribute('ondragover', 'App.handleDragOver(event)');
            bodyDiv.setAttribute('ondrop', `App.handleDrop(event, '${name}', -1)`);
            
            const buildCell = (t, i, colorClass, customLabel = null) => {
                let status = t.status || (t.completed ? 'concluido' : 'pendente');
                let bgClass = 'bg-white border-slate-200'; 
                let opacityClass = '';
                const isRetorno = t.veioDeReprogramacao;
                
                if (status === 'concluido') { bgClass = 'bg-emerald-50/70 border-emerald-300'; } 
                else if (status === 'cancelado') { bgClass = 'bg-slate-50 border-slate-200'; opacityClass = 'opacity-60 grayscale'; } 
                else if (status === 'nao_feito') { bgClass = 'bg-red-50/70 border-red-300'; }
                else if (isRetorno) { bgClass = 'bg-amber-50/40 border-amber-300'; }

                const label = customLabel || WhatsappService.getPluralLabel(t.type || 'troca', t.qty || 1);
                
                let obsHtml = '';
                if (t.obs) {
                    const parts = t.obs.split(/\|? ?MOT: /);
                    const logObs = parts[0].trim();
                    const motObs = parts[1] ? parts[1].trim() : '';

                    if (logObs) obsHtml += `<div class="mt-1.5 text-[9px] text-slate-700 bg-amber-50/60 border-l-2 border-amber-400 px-1.5 py-0.5 font-medium leading-tight shadow-sm">${logObs}</div>`;
                    if (motObs) obsHtml += `<div class="mt-1.5 text-[9px] text-slate-700 bg-blue-50/60 border-l-2 border-blue-400 px-1.5 py-0.5 font-medium leading-tight shadow-sm"><i class="fas fa-reply text-blue-400 text-[8px] mr-0.5"></i> ${motObs}</div>`;
                }

                let tagsHtml = '';
                if (t.mtr || t.descarteLocal) {
                    tagsHtml += `<div class="flex flex-wrap gap-1 mt-1.5">`;
                    if (t.mtr) tagsHtml += `<span class="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded text-[8px] font-bold"><i class="fas fa-file-invoice mr-0.5"></i> MTR: ${t.mtr}</span>`;
                    if (t.descarteLocal) tagsHtml += `<span class="bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded text-[8px] font-bold"><i class="fas fa-recycle mr-0.5"></i> DESC: ${t.descarteLocal}</span>`;
                    tagsHtml += `</div>`;
                }

                let fotosHtml = '';
                if (t.fotoObs || t.foto) {
                    fotosHtml += `<div class="flex flex-wrap gap-1 mt-1.5">`;
                    if (t.fotoObs) fotosHtml += `
                        <div class="flex shadow-sm">
                            <button onclick="UI.showPhoto('${t.fotoObs}')" class="bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 border-r-0 px-1.5 py-0.5 rounded-l text-[8px] font-bold transition"><i class="fas fa-image mr-1"></i>FOTO LOG</button>
                            <button onclick="App.removePhotoObs('${name}', ${i})" class="bg-sky-50 hover:bg-red-100 text-slate-400 hover:text-red-600 border border-sky-200 px-1.5 py-0.5 rounded-r transition"><i class="fas fa-times text-[8px]"></i></button>
                        </div>`;
                    if (t.foto) fotosHtml += `<button onclick="UI.showPhoto('${t.foto}')" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[8px] font-bold transition shadow-sm"><i class="fas fa-camera mr-1"></i>FOTO MOT</button>`;
                    fotosHtml += `</div>`;
                }

                const avisoRetorno = isRetorno ? `<div class="mt-1.5 text-[9px] text-orange-800 bg-orange-100 font-bold px-1.5 py-0.5 rounded inline-block shadow-sm"><i class="fas fa-exclamation-triangle text-orange-500 mr-0.5"></i> ADIADO: ${t.dataOrigem}</div>` : '';
                const timeTag = ((status === 'concluido' || status === 'nao_feito') && t.horaConclusao) ? `<div class="mt-2 text-[8px] font-black ${status==='concluido'?'text-emerald-600':'text-red-600'} flex items-center gap-1"><i class="far fa-clock"></i> ${status==='concluido'?'FEITO':'NÃO FEITO'} ÀS ${t.horaConclusao}</div>` : '';

                const barraAcoesHtml = `
                    <div class="mt-2 pt-1.5 border-t border-slate-100 flex gap-1 justify-between items-center bg-slate-50/50 -mx-1 -mb-1 px-1 pb-1 rounded-b">
                        <div class="flex gap-1">
                            <button onclick="App.returnToAgenda('${name}', ${i})" class="w-6 h-6 rounded bg-white border border-slate-200 text-slate-400 hover:text-purple-600 hover:border-purple-200 hover:bg-purple-50 flex items-center justify-center transition shadow-sm" title="Devolver p/ Agenda">
                                <i class="fas fa-undo text-[9px]"></i>
                            </button>
                            <button onclick="App.openDriverRescheduleModal('${name}', ${i})" class="w-6 h-6 rounded bg-white border border-slate-200 text-slate-400 hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50 flex items-center justify-center transition shadow-sm" title="Adiar / Reprogramar">
                                <i class="fas fa-calendar-alt text-[9px]"></i>
                            </button>
                        </div>
                        <div class="flex gap-1">
                            <button onclick="App.editObs('${name}', ${i})" class="h-6 px-1.5 rounded bg-white border border-slate-200 text-slate-500 hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 flex items-center justify-center gap-1 transition shadow-sm text-[9px] font-bold" title="Editar OBS">
                                <i class="fas fa-comment-dots text-[9px]"></i><span class="hidden xl:inline">OBS</span>
                            </button>
                            <button onclick="App.openMtrModal(${i}, '${name}')" class="h-6 px-1.5 rounded bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 flex items-center justify-center gap-1 transition shadow-sm text-[9px] font-bold" title="Definir MTR">
                                <i class="fas fa-file-invoice text-[9px]"></i><span class="hidden xl:inline">MTR</span>
                            </button>
                            <button onclick="App.attachPhotoObs('${name}', ${i})" class="w-6 h-6 rounded bg-white border border-slate-200 text-slate-400 hover:text-sky-600 hover:border-sky-200 hover:bg-sky-50 flex items-center justify-center transition shadow-sm" title="Anexar Foto (Logística)">
                                <i class="fas fa-camera text-[9px]"></i>
                            </button>
                            <button onclick="App.addExtraObs('${name}', ${i})" class="w-6 h-6 rounded bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 flex items-center justify-center transition shadow-sm font-black" title="Adicionar OBS Extra (Aviso de Rota)">
                                +
                            </button>
                        </div>
                    </div>
                `;

                // 🔥 O CARD DO SERVIÇO EM SI 🔥
                const cardHtml = `
                <div draggable="true" 
                     ondragstart="App.handleDriverDragStart(event, '${name}', ${i})"
                     ondrop="App.handleDrop(event, '${name}', ${i})"
                     class="drag-item p-2.5 border rounded-lg shadow-md relative flex flex-col cursor-grab active:cursor-grabbing transition-all hover:border-blue-400 ${bgClass} ${opacityClass}">
                    
                    <div class="absolute top-2 right-2 flex gap-1 z-10">
                        <button onclick="App.setTripStatus('${name}', ${i}, 'concluido')" class="w-5 h-5 rounded bg-white hover:bg-emerald-50 text-slate-300 hover:text-emerald-500 flex items-center justify-center border border-slate-200 transition shadow-sm" title="Marcar Concluído"><i class="fas fa-check text-[9px]"></i></button>
                        <button onclick="App.setTripStatus('${name}', ${i}, 'cancelado')" class="w-5 h-5 rounded bg-white hover:bg-red-50 text-slate-300 hover:text-red-500 flex items-center justify-center border border-slate-200 transition shadow-sm" title="Marcar Cancelado"><i class="fas fa-times text-[9px]"></i></button>
                    </div>

                    <div class="flex items-center gap-1 w-fit mb-1.5">
                        <button onclick="App.changeQty('${name}', ${i})" class="text-slate-600 hover:text-blue-600 hover:bg-blue-50 text-[10px] font-black bg-white rounded px-1.5 py-0.5 border border-slate-200 shadow-sm transition cursor-pointer" title="Mudar Quantidade">
                            ${t.qty || 1}
                        </button>
                        <button onclick="App.cycleType('${name}', ${i})" class="${colorClass} text-[9px] font-black bg-white hover:bg-slate-50 rounded px-1.5 py-0.5 border border-slate-200 shadow-sm transition cursor-pointer flex items-center gap-1" title="Mudar Tipo">
                            ${label} <i class="fas fa-sync-alt opacity-30 text-[7px]"></i>
                        </button>
                    </div>

                    <div class="pr-12 leading-tight">
                        ${t.empresa ? `<div class="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">${t.empresa}</div>` : ''}
                        <div class="text-[12px] font-black text-slate-800 break-words">${t.obra || 'Sem Nome'}</div>
                    </div>
                    
                    ${avisoRetorno}

                    <div class="flex items-start gap-1 mt-1.5">
                        <i class="fas fa-map-marker-alt text-red-400 text-[9px] mt-0.5"></i>
                        <div class="text-[9px] font-semibold text-slate-500 leading-tight flex-1 break-words">${WhatsappService.formatAddress(typeof t.to === 'string' ? t.to : (t.to && t.to.text ? t.to.text : ''))}</div>
                    </div>

                    ${tagsHtml}
                    ${fotosHtml}
                    ${obsHtml}
                    ${timeTag}
                    ${barraAcoesHtml}
                </div>`;

                // 🔥 O BLOCO DA OBSERVAÇÃO EXTRA (FICA SEPARADO DO CARD, LOGO ABAIXO DELE) 🔥
                const extraBlockHtml = t.obsExtra ? `
                <div class="bg-red-100 border-2 border-dashed border-red-400 text-red-900 text-[10px] font-black py-1.5 px-2 rounded-lg shadow-sm uppercase text-center break-words z-10 w-[95%] self-center cursor-pointer hover:bg-red-200 transition" onclick="App.addExtraObs('${name}', ${i})" title="Clique para editar">
                    ATENÇÃO: ${t.obsExtra}
                </div>` : '';

                // Retorna o Card + O Bloco (O Tailwind "gap-2" cuida do espaçamento perfeito entre eles)
                return cardHtml + extraBlockHtml;
            };

            let tripsHtml = '';
            
            if (trips.length === 0) {
                tripsHtml = `
                    <div class="text-center text-slate-300 font-bold opacity-60 flex flex-col items-center justify-center h-full border-2 border-dashed border-slate-200 rounded-xl m-2 pointer-events-none">
                        <i class="fas fa-truck-loading text-2xl mb-2"></i>
                        <span class="text-[9px] uppercase tracking-widest">Rotas<br>aqui</span>
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
                <div class="mt-auto p-2 bg-slate-100 border-t border-slate-300">
                    <button onclick="App.shareDriverRoute('${name}')" class="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-[10px] font-black rounded-lg shadow flex items-center justify-center gap-2 transition transform hover:scale-[1.02] ${trips.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}" ${trips.length === 0 ? 'disabled' : ''}>
                        <i class="fab fa-whatsapp text-sm"></i> ENVIAR ROTA
                    </button>
                </div>
            `;

            column.innerHTML = headerHtml;
            column.appendChild(bodyDiv);
            column.insertAdjacentHTML('beforeend', footerHtml);
            
            container.appendChild(column);
        });
    },

    handleAgendaDragStart(e, id) {
        const agendaItem = State.data.agendamentos.find(a => a.id === id);
        if (agendaItem && (agendaItem.distribuido || agendaItem.reprogramado)) {
            e.preventDefault(); 
            return false;
        }

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
        if (!targetDriver.trips) targetDriver.trips = [];

        if (source.type === 'agenda') {
            const agendaItem = State.data.agendamentos.find(a => a.id === source.id);
            if(agendaItem) {
                if(agendaItem.distribuido || agendaItem.reprogramado) {
                    UI.toast("Este serviço já está bloqueado!", "error");
                    return false;
                }

                const newTrip = {
                    id: Date.now() + Math.random(),
                    status: 'pendente',
                    completed: false,
                    agendaId: agendaItem.id, // VINCULA
                    empresa: agendaItem.empresa, 
                    obra: agendaItem.obra, 
                    qty: agendaItem.qty, 
                    type: agendaItem.type,
                    obs: agendaItem.obs, 
                    to: { text: agendaItem.address }, 
                    mtr: null, 
                    descarteLocal: null,
                    veioDeReprogramacao: agendaItem.veioDeReprogramacao || false, // 🔥 HERDA A PRIORIDADE 🔥
                    dataOrigem: agendaItem.dataOrigem || ''
                };
                
                if (targetIndex === -1) {
                    targetDriver.trips.push(newTrip);
                } else {
                    targetDriver.trips.splice(targetIndex, 0, newTrip);
                }
                
                agendaItem.distribuido = true;
                State.saveAll();
                
                App.renderSpreadsheet();
                App.renderAgendaPanel();
                App.renderAgendaTab();
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
    
    returnToAgenda(driverName, tripIndex) {
        if(!confirm("Devolver este serviço para os Agendamentos?")) return;
        
        const driver = State.getCurrentFleet()[driverName];
        if (!driver || !driver.trips || !driver.trips[tripIndex]) return;

        const trip = driver.trips.splice(tripIndex, 1)[0]; 

        if (trip.agendaId) {
            const ag = State.data.agendamentos.find(a => a.id === trip.agendaId);
            if (ag) ag.distribuido = false; 
        } else {
            const agendaItem = {
                id: Date.now(), date: State.session.routeDate, shift: State.session.shift, empresa: trip.empresa || '',
                obra: trip.obra || '', address: typeof trip.to === 'string' ? trip.to : (trip.to && trip.to.text ? trip.to.text : ''),
                obs: trip.obs || '', qty: trip.qty || 1, type: trip.type || 'troca',
                veioDeReprogramacao: trip.veioDeReprogramacao || false, dataOrigem: trip.dataOrigem || ''
            };
            if (!State.data.agendamentos) State.data.agendamentos = [];
            State.data.agendamentos.push(agendaItem);
        }
        
        State.saveAll();

        this.renderSpreadsheet();
        this.renderAgendaPanel();
        this.renderAgendaTab();
        this.renderGrid();
        
        UI.toast("Serviço devolvido para a agenda!");
    },

    // ==========================================
    // 🔥 LÓGICA DE AGENDAMENTO COM TURNOS E REPROGRAMAÇÃO 🔥
    // ==========================================
    
    openRescheduleModal(id) {
        UI.tempAgendaId = id;
        UI.rescheduleSource = 'agenda';
        UI.toggleModal('reschedule-modal');
    },

    openDriverRescheduleModal(driverName, tripIndex) {
        UI.tempDriverName = driverName;
        UI.tempTripIndex = tripIndex;
        UI.rescheduleSource = 'driver';
        UI.toggleModal('reschedule-modal');
    },

    confirmReschedule() {
        const newDate = document.getElementById('reschedule-date').value;
        const newShift = document.querySelector('input[name="reschedule-shift"]:checked').value;

        if (!newDate) return UI.toast("Selecione a nova data!", "error");

        const shiftNome = newShift === 'night' ? 'Noite' : 'Dia';
        const dataBr = newDate.split('-').reverse().join('/');
        const appendObs = `[Reprogramado p/ ${dataBr} - ${shiftNome}]`;

        if (UI.rescheduleSource === 'agenda') {
            const id = UI.tempAgendaId;
            const original = State.data.agendamentos.find(a => a.id === id);
            if (original) {
                const originalDateBr = original.date.split('-').reverse().join('/');
                const novoItem = {
                    ...original, id: Date.now() + Math.random(), date: newDate, shift: newShift, distribuido: false, reprogramado: false,
                    veioDeReprogramacao: true, dataOrigem: originalDateBr // 🔥 MARCA QUE É HERANÇA E SALVA A DATA 🔥
                };
                original.reprogramado = true;
                original.obs = (original.obs ? original.obs + ' | ' : '') + appendObs;

                State.data.agendamentos.push(novoItem);
                State.saveAll();

                UI.toggleModal('reschedule-modal');
                App.renderAgendaTab();
                App.renderAgendaPanel();
                UI.toast("Serviço reprogramado com sucesso!");
            }
        } 
        else if (UI.rescheduleSource === 'driver') {
            const driverName = UI.tempDriverName;
            const tripIndex = UI.tempTripIndex;
            const driver = State.getCurrentFleet()[driverName];
            
            if (driver && driver.trips[tripIndex]) {
                const trip = driver.trips[tripIndex];
                const originalDateBr = State.session.routeDate.split('-').reverse().join('/');
                
                if (trip.agendaId) {
                    const originalAgenda = State.data.agendamentos.find(a => a.id === trip.agendaId);
                    if (originalAgenda) {
                        const originalDateAgendaBr = originalAgenda.date.split('-').reverse().join('/');
                        const novoItem = {
                            ...originalAgenda, id: Date.now() + Math.random(), date: newDate, shift: newShift, distribuido: false, reprogramado: false,
                            veioDeReprogramacao: true, dataOrigem: originalDateAgendaBr // 🔥 MARCA QUE É HERANÇA E SALVA A DATA 🔥
                        };
                        originalAgenda.reprogramado = true;
                        originalAgenda.obs = (originalAgenda.obs ? originalAgenda.obs + ' | ' : '') + appendObs;
                        State.data.agendamentos.push(novoItem);
                    }
                } else {
                    const novoItem = {
                        id: Date.now() + Math.random(), date: newDate, shift: newShift, empresa: trip.empresa || '',
                        obra: trip.obra || '', address: typeof trip.to === 'string' ? trip.to : (trip.to && trip.to.text ? trip.to.text : ''),
                        obs: trip.obs || '', qty: trip.qty || 1, type: trip.type || 'troca', distribuido: false, reprogramado: false,
                        veioDeReprogramacao: true, dataOrigem: originalDateBr // 🔥 MARCA QUE É HERANÇA E SALVA A DATA 🔥
                    };
                    State.data.agendamentos.push(novoItem);
                }

                driver.trips.splice(tripIndex, 1);
                
                State.saveAll();
                UI.toggleModal('reschedule-modal');
                App.renderSpreadsheet();
                App.renderAgendaTab();
                App.renderAgendaPanel();
                App.renderGrid();
                UI.toast("Retirado da rota e Reprogramado!");
            }
        }
    },

    addAgenda() {
        const date = document.getElementById('agenda-date').value;
        const shift = document.querySelector('input[name="agenda-shift-sel"]:checked')?.value || 'day';
        
        const empresa = document.getElementById('agenda-empresa').value;
        const obra = document.getElementById('agenda-obra').value;
        const addr = document.getElementById('agenda-addr').value;
        const obs = document.getElementById('agenda-obs').value;
        const qty = document.getElementById('agenda-qty').value;
        const type = State.session.agendaType || 'troca';

        if (!date) return UI.toast("Selecione a data do calendário acima!", "error");
        if (!addr && !obra) return UI.toast("Preencha a obra ou endereço", "error");

        State.addAgendamento({ id: Date.now(), date, shift, empresa, obra, address: addr, obs, qty, type, distribuido: false, reprogramado: false, veioDeReprogramacao: false });

        if (empresa || obra) State.addToAddressBook(empresa, obra, addr);

        document.getElementById('agenda-empresa').value = '';
        document.getElementById('agenda-obra').value = '';
        document.getElementById('agenda-addr').value = '';
        document.getElementById('agenda-obs').value = '';

        UI.toast("Serviço Agendado com sucesso!");
        this.renderAgendaTab();
        this.renderAddressBook(); 
        
        if (date === State.session.routeDate) this.renderAgendaPanel();
    },

    renderAgendaTab() {
        const list = document.getElementById('agenda-tab-list');
        if(!list) return;
        const selectedDate = document.getElementById('agenda-date').value;
        const searchInput = document.getElementById('search-agenda');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

        list.innerHTML = '';
        if (!selectedDate) {
            list.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">Selecione uma data acima</div>';
            return;
        }

        let agendados = State.data.agendamentos.filter(a => a.date === selectedDate);
        
        if (searchTerm) {
            agendados = agendados.filter(a => 
                (a.obra && a.obra.toLowerCase().includes(searchTerm)) ||
                (a.empresa && a.empresa.toLowerCase().includes(searchTerm)) ||
                (a.address && a.address.toLowerCase().includes(searchTerm))
            );
        }

        if (agendados.length === 0) {
            if (searchTerm) return list.innerHTML = '<div class="text-center text-xs text-slate-400 py-4"><i class="fas fa-search-minus text-2xl mb-2 opacity-50"></i><br>Nenhum serviço encontrado.</div>';
            return list.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">Nenhum serviço agendado</div>';
        }

        const ordemPrioridade = { 'troca': 1, 'retirada': 2, 'colocacao': 3, 'encher': 4 };
        agendados.sort((a, b) => (ordemPrioridade[a.type] || 5) - (ordemPrioridade[b.type] || 5));

        agendados.forEach(item => {
            const isDist = item.distribuido;
            const isReprog = item.reprogramado;
            const isLocked = isDist || isReprog;
            const isRetorno = item.veioDeReprogramacao; // 🔥 VERIFICA SE É PRIORIDADE 🔥
            const isNight = document.body.classList.contains('night-mode');
            
            let baseClass = 'bg-slate-50 border-slate-200';
            let finalStyle = '';
            
            if (isReprog) {
                baseClass = 'opacity-80';
                finalStyle = isNight ? 'background-color: rgba(194,65,12,0.2) !important; border-color: #9a3412 !important;' : 'background-color: #fff7ed !important; border-color: #fed7aa !important;';
            } else if (isDist) {
                baseClass = 'opacity-80';
                finalStyle = isNight ? 'background-color: rgba(30,58,138,0.4) !important; border-color: #1e3a8a !important;' : 'background-color: #eff6ff !important; border-color: #bfdbfe !important;';
            } else if (isRetorno) {
                // 🔥 SE FOR PRIORIDADE E NÃO TIVER SIDO FEITO AINDA, FICA AMARELO 🔥
                baseClass = 'bg-yellow-50 border-yellow-400 shadow-md';
                finalStyle = isNight ? 'background-color: rgba(234, 179, 8, 0.15) !important; border-color: #a16207 !important;' : 'background-color: #fefce8 !important; border-color: #facc15 !important;';
            }

            const empresaTag = item.empresa ? `<span class="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded uppercase mr-1 border border-purple-200">${item.empresa}</span>` : '';
            const shiftBadge = (item.shift === 'night') ? `<span class="bg-slate-800 text-white px-1.5 py-0.5 rounded text-[8px] uppercase border border-slate-600 shadow-sm ml-1">🌙 Noite</span>` : `<span class="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded text-[8px] uppercase border border-yellow-300 shadow-sm ml-1">🌞 Dia</span>`;
            const obsTag = item.obs ? `<div class="mt-1 text-[9px] bg-amber-100 text-amber-800 p-1 rounded font-bold">OBS: ${item.obs}</div>` : '';
            
            // 🔥 AVISO DE PRIORIDADE NA TELA 🔥
            const avisoRetorno = (isRetorno && !isLocked) ? `<div class="mt-2 text-[10px] bg-yellow-200 text-yellow-900 font-black rounded-lg p-1.5 border border-yellow-400 shadow-sm animate-pulse"><i class="fas fa-exclamation-triangle"></i> PRIORIDADE: ADIADO DO DIA ${item.dataOrigem}</div>` : '';

            let typeColor = 'text-slate-800';
            if(item.type === 'colocacao') typeColor = 'text-red-600';
            if(item.type === 'retirada') typeColor = 'text-purple-600';
            if(item.type === 'encher') typeColor = 'text-amber-600';
            const label = WhatsappService.getPluralLabel(item.type || 'troca', item.qty || 1);

            let botoesEdit = '';
            if (isReprog) {
                botoesEdit = `<span class="text-[9px] font-black text-orange-600 bg-orange-100 px-2 py-1 rounded border border-orange-200"><i class="fas fa-calendar-check"></i> REPROGRAMADO</span>`;
            } else if (isDist) {
                botoesEdit = `<div class="flex gap-1"><span class="text-[9px] font-black text-blue-600 bg-blue-100 px-2 py-1 rounded border border-blue-200"><i class="fas fa-check-circle"></i> NA ROTA</span><button onclick="App.forceUnlockAgenda(${item.id})" class="text-[10px] font-black text-red-600 bg-red-100 hover:bg-red-200 rounded py-0.5 px-2 border border-red-200 shadow-sm transition" title="Desbloquear"><i class="fas fa-unlock"></i></button></div>`;
            } else {
                botoesEdit = `<button onclick="App.changeAgendaQty(${item.id})" class="text-[10px] font-black bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-300 transition cursor-pointer">${item.qty || 1}</button><button onclick="App.cycleAgendaType(${item.id})" class="text-[10px] font-black ${typeColor} bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1 border border-slate-200">${label} <i class="fas fa-sync-alt opacity-40 hover:opacity-100 text-[8px]"></i></button>`;
            }

            let acoesDireita = '';
            if (!isLocked) {
                acoesDireita = `
                    <div class="flex flex-col gap-2 items-center">
                        <button onclick="App.openRescheduleModal(${item.id})" class="text-slate-300 hover:text-orange-500 transition-colors p-1" title="Reprogramar"><i class="fas fa-calendar-alt text-sm"></i></button>
                        <button onclick="App.deleteAgenda(${item.id})" class="text-slate-300 hover:text-red-500 transition-colors p-1" title="Excluir"><i class="fas fa-trash-alt text-sm"></i></button>
                    </div>
                `;
            } else if (isReprog) {
                acoesDireita = `
                    <div class="flex flex-col gap-2 items-center">
                        <button onclick="App.deleteAgenda(${item.id})" class="text-orange-300 hover:text-red-500 transition-colors p-1" title="Excluir Histórico"><i class="fas fa-trash-alt text-sm"></i></button>
                    </div>
                `;
            }

            const div = document.createElement('div');
            div.className = `flex justify-between items-start p-3 rounded-lg border shadow-sm animate-fade-in ag-item-card transition-all ${baseClass}`;
            div.style = finalStyle;
            
            div.innerHTML = `
                <div class="pr-2 flex-1 min-w-0">
                    <div class="flex items-center gap-1 mb-1 w-fit">${botoesEdit}</div>
                    <div class="text-[11px] font-bold ${isDist ? 'text-blue-900' : (isReprog ? 'text-orange-900' : 'text-slate-800')} truncate leading-tight mt-1">${empresaTag}${item.obra || 'Sem Nome'} ${shiftBadge}</div>
                    <div class="text-[9px] ${isDist ? 'text-blue-600' : (isReprog ? 'text-orange-700' : 'text-slate-500')} mt-1 leading-tight"><i class="fas fa-map-marker-alt ${isDist ? 'text-blue-500' : (isReprog ? 'text-orange-400' : 'text-red-400')} mr-1"></i>${WhatsappService.formatAddress(item.address)}</div>
                    ${avisoRetorno}
                    ${obsTag}
                </div>
                ${acoesDireita}
            `;
            list.appendChild(div);
        });
    },

    renderAgendaPanel() {
        const list = document.getElementById('spreadsheet-agenda-list');
        if(!list) return;

        const searchInput = document.getElementById('search-agenda-panel');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

        let agendadosHj = State.data.agendamentos.filter(a => a.date === State.session.routeDate && (a.shift || 'day') === State.session.shift);
        
        const badge = document.getElementById('agenda-count-badge');
        if (badge) badge.innerText = agendadosHj.length;

        if (searchTerm) {
            agendadosHj = agendadosHj.filter(a => 
                (a.obra && a.obra.toLowerCase().includes(searchTerm)) || (a.empresa && a.empresa.toLowerCase().includes(searchTerm)) || (a.address && a.address.toLowerCase().includes(searchTerm))
            );
        }

        list.innerHTML = '';
        if(agendadosHj.length === 0) return list.innerHTML = '<div class="text-center text-xs text-purple-400 py-4 font-bold mt-10"><i class="far fa-smile text-2xl mb-2"></i><br>Nenhum agendamento para este turno.</div>';

        const ordemPrioridade = { 'troca': 1, 'retirada': 2, 'colocacao': 3, 'encher': 4 };
        agendadosHj.sort((a, b) => (ordemPrioridade[a.type] || 5) - (ordemPrioridade[b.type] || 5));
        const isNight = document.body.classList.contains('night-mode');

        agendadosHj.forEach(a => {
            const isDist = a.distribuido;
            const isReprog = a.reprogramado;
            const isLocked = isDist || isReprog;
            const isRetorno = a.veioDeReprogramacao; // 🔥 VERIFICA PRIORIDADE 🔥

            let colorClass = 'text-slate-800';
            if(a.type === 'colocacao') colorClass = 'text-red-600';
            if(a.type === 'retirada') colorClass = 'text-purple-600';
            if(a.type === 'encher') colorClass = 'text-amber-600';
            const label = WhatsappService.getPluralLabel(a.type || 'troca', a.qty || 1);

            const dragAttrs = isLocked ? '' : `draggable="true" ondragstart="App.handleAgendaDragStart(event, ${a.id})"`;
            let baseClass = isLocked ? 'opacity-60 cursor-not-allowed' : 'bg-white border-purple-200 hover:border-purple-400 hover:shadow-md cursor-grab active:cursor-grabbing';

            let finalStyle = '';
            if (isReprog) {
                finalStyle = isNight ? 'background-color: rgba(194,65,12,0.2) !important; border-color: #9a3412 !important;' : 'background-color: #fff7ed !important; border-color: #fed7aa !important;';
            } else if (isDist) {
                finalStyle = isNight ? 'background-color: rgba(30,58,138,0.4) !important; border-color: #1e3a8a !important;' : 'background-color: #eff6ff !important; border-color: #bfdbfe !important;';
            } else if (isRetorno) {
                // 🔥 SE FOR PRIORIDADE NA PLANILHA TAMBÉM FICA AMARELO 🔥
                baseClass = 'bg-yellow-50 border-yellow-400 shadow-md cursor-grab active:cursor-grabbing';
                finalStyle = isNight ? 'background-color: rgba(234, 179, 8, 0.15) !important; border-color: #a16207 !important;' : 'background-color: #fefce8 !important; border-color: #facc15 !important;';
            }

            let botoesEdit = '';
            if (isReprog) {
                botoesEdit = `<span class="text-[10px] font-black text-orange-700 bg-orange-100 rounded-md py-0.5 px-2 border border-orange-200 shadow-sm"><i class="fas fa-calendar-check"></i> REPROGRAMADO</span>`;
            } else if (isDist) {
                botoesEdit = `<div class="flex gap-1"><span class="text-[10px] font-black text-blue-700 bg-blue-100 rounded-md py-0.5 px-2 border border-blue-200 shadow-sm"><i class="fas fa-check"></i> JÁ DISTRIBUÍDO</span><button onclick="App.forceUnlockAgenda(${a.id})" class="text-[10px] font-black text-red-600 bg-red-100 hover:bg-red-200 rounded-md py-0.5 px-2 border border-red-200 shadow-sm transition" title="Desbloquear"><i class="fas fa-unlock"></i></button></div>`;
            } else {
                botoesEdit = `<button onclick="App.changeAgendaQty(${a.id})" class="text-slate-600 hover:text-blue-600 text-[10px] font-black bg-slate-100 rounded-md py-0.5 px-1.5 border border-slate-200 shadow-sm transition">${a.qty || 1}</button><button onclick="App.cycleAgendaType(${a.id})" class="${colorClass} text-[10px] font-black bg-slate-50 hover:bg-slate-200 rounded-md py-0.5 px-2 border border-slate-200 shadow-sm transition flex items-center gap-1">${label} <i class="fas fa-sync-alt opacity-40 hover:opacity-100 text-[8px]"></i></button>`;
            }

            let botoesAcaoPanel = '';
            if (!isLocked) {
                botoesAcaoPanel = `
                    <div class="flex gap-2 items-center">
                        <button onclick="App.openRescheduleModal(${a.id})" class="text-slate-300 hover:text-orange-500 transition-colors p-1" title="Reprogramar"><i class="fas fa-calendar-alt"></i></button>
                        <button onclick="App.deleteAgenda(${a.id})" class="text-slate-300 hover:text-red-500 transition-colors p-1" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
            } else if (isReprog) {
                botoesAcaoPanel = `
                    <div class="flex gap-2 items-center">
                        <button onclick="App.deleteAgenda(${a.id})" class="text-orange-300 hover:text-red-500 transition-colors p-1" title="Excluir Histórico"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
            }
            
            // 🔥 AVISO DE PRIORIDADE NA PLANILHA ROXA 🔥
            const avisoRetorno = (isRetorno && !isLocked) ? `<div class="mt-2 text-[10px] bg-orange-500 text-white font-black rounded-lg p-1.5 border border-orange-600 shadow-md animate-pulse"><i class="fas fa-exclamation-triangle text-yellow-200"></i> PRIORIDADE: ADIADO DO DIA ${a.dataOrigem}</div>` : '';
            list.innerHTML += `
            <div ${dragAttrs} style="${finalStyle}" class="drag-item p-3 border rounded-xl shadow-sm flex flex-col relative animate-fade-in transition ag-item-card ${baseClass}">
                <div class="flex items-center justify-between gap-1 w-full mb-2">
                    <div class="flex gap-1">${botoesEdit}</div>
                    ${botoesAcaoPanel}
                </div>
                <div class="font-bold text-[11px] leading-tight tracking-wide ${isDist ? 'text-blue-900' : (isReprog ? 'text-orange-900' : 'text-slate-800')} break-words">
                    ${a.empresa ? `<span class="text-slate-500 uppercase text-[9px]">${a.empresa}</span><br>` : ''}
                    <span class="text-[13px] font-black">${a.obra || 'Sem Nome'}</span>
                </div>
                <div class="text-[9px] ${isDist ? 'text-blue-600' : (isReprog ? 'text-orange-700' : 'text-slate-500')} mt-1 leading-tight"><i class="fas fa-map-marker-alt ${isDist ? 'text-blue-500' : (isReprog ? 'text-orange-400' : 'text-red-400')} mr-1"></i>${WhatsappService.formatAddress(a.address)}</div>
                ${avisoRetorno}
                ${a.obs ? `<div class="mt-2 text-[10px] bg-amber-100 text-amber-900 font-bold rounded-lg p-1.5 border border-amber-300"><i class="fas fa-exclamation-triangle"></i> OBS: ${a.obs}</div>` : ''}
            </div>`;
        });
    },

    autoDistributeAgenda() {
        const agendados = State.data.agendamentos.filter(a => a.date === State.session.routeDate && !a.distribuido && !a.reprogramado && (a.shift || 'day') === State.session.shift);
        if (agendados.length === 0) return UI.toast("Nenhum agendamento do turno atual pendente.", "info");

        if(!confirm("Deseja que o sistema divida os serviços automaticamente?")) return;

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

        Object.values(groups).sort((a, b) => b.length - a.length).forEach(group => {
            driverLoads.sort((a, b) => a.count - b.count);
            const targetDriver = driverLoads[0];
            const targetDriverObj = State.getCurrentFleet()[targetDriver.name];
            if (!targetDriverObj.trips) targetDriverObj.trips = [];

            group.forEach(a => {
                targetDriverObj.trips.push({
                    id: Date.now() + Math.random(), status: 'pendente', completed: false, agendaId: a.id,
                    empresa: a.empresa, obra: a.obra, qty: a.qty, type: a.type, obs: a.obs, to: { text: a.address }, mtr: null, descarteLocal: null,
                    veioDeReprogramacao: a.veioDeReprogramacao || false, dataOrigem: a.dataOrigem || '' // 🔥 COPIA A PRIORIDADE PRO MOTORISTA 🔥
                });
                a.distribuido = true;
                targetDriver.count++;
            });
        });

        State.saveAll();
        this.renderSpreadsheet();
        this.renderAgendaPanel();
        this.renderAgendaTab();
        this.renderGrid();
        UI.toast("Serviços distribuídos!");
    },
   // =========================================================
    // 🔥 GERADOR DE IMAGEM LIMPA PARA CLIENTES/LEIGOS 🔥
    // =========================================================
    downloadPreview() {
        UI.toast("Gerando imagem de alta qualidade, aguarde...", "info");
        
        const container = document.getElementById('export-container');
        const grid = document.getElementById('export-grid');
        const date = WhatsappService.getFormattedDate();
        const shift = State.session.shift === 'day' ? 'DIA' : 'NOITE';
        
        document.getElementById('export-title').innerText = `ROTAS DE ${shift} - ${date}`;
        grid.innerHTML = '';
        
        const drivers = State.getDriversByShift();
        let rotasExistem = false;
        
        drivers.forEach(name => {
            const d = State.getDriver(name);
            if(!d || !d.trips || d.trips.length === 0) return; 
            
            const activeTrips = d.trips.filter(t => t.status !== 'cancelado');
            if (activeTrips.length === 0) return;

            rotasExistem = true;
            let tripsHtml = '';
            
            activeTrips.forEach(t => {
                const isDone = (t.status === 'concluido' || t.completed);
                const isFailed = (t.status === 'nao_feito');
                const isRetorno = t.veioDeReprogramacao;
                
                let bgColor = '#ffffff'; 
                let borderColor = '#e2e8f0'; 
                let statusColor = '#94a3b8'; 
                let iconStr = '';

                if (isDone) {
                    bgColor = '#ecfdf5'; 
                    borderColor = '#a7f3d0'; 
                    statusColor = '#10b981'; 
                    iconStr = '✅ ';
                } else if (isFailed) {
                    bgColor = '#fef2f2'; 
                    borderColor = '#fecaca'; 
                    statusColor = '#ef4444'; 
                    iconStr = '❌ ';
                } else if (isRetorno) {
                    bgColor = '#fff7ed'; 
                    borderColor = '#fed7aa'; 
                    statusColor = '#f97316'; 
                    iconStr = '⚠️ ';
                }

                const qty = t.qty || 1;
                const label = WhatsappService.getPluralLabel(t.type, qty);
                const displayType = t.type === 'encher' ? 'ENCHER' : label;
                
                // 🔥 NOVA LÓGICA: MOSTRAR HORÁRIOS E DATAS NA IMAGEM 🔥
                let timeHtml = '';
                if (isDone && t.horaConclusao) {
                    timeHtml = `<div style="font-size: 10px; font-weight: 900; color: #059669; margin-top: 6px; letter-spacing: 0.5px;">🕒 FEITO ÀS ${t.horaConclusao}</div>`;
                } else if (isFailed && t.horaConclusao) {
                    timeHtml = `<div style="font-size: 10px; font-weight: 900; color: #dc2626; margin-top: 6px; letter-spacing: 0.5px;">🕒 NÃO FEITO ÀS ${t.horaConclusao}</div>`;
                } else if (isRetorno && t.dataOrigem) {
                    timeHtml = `<div style="font-size: 10px; font-weight: 900; color: #d97706; margin-top: 6px; letter-spacing: 0.5px;">⚠️ ADIADO DO DIA ${t.dataOrigem}</div>`;
                }
                
                tripsHtml += `
                    <div style="margin-bottom: 8px; padding: 10px; background-color: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px;">
                        <div style="display: flex; align-items: flex-start; gap: 8px;">
                            <div style="margin-top: 4px; width: 12px; height: 12px; border-radius: 50%; background-color: ${statusColor}; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.1);"></div>
                            <div style="flex: 1; line-height: 1.2;">
                                <div style="display: inline-block; background-color: #ffffff; border: 1px solid ${borderColor}; color: #1e293b; font-size: 10px; font-weight: 900; padding: 2px 6px; border-radius: 4px; letter-spacing: 1px; margin-bottom: 4px;">${qty} ${displayType}</div>
                                <div style="font-size: 14px; font-weight: 900; color: #0f172a; word-break: break-word;">${iconStr}${t.obra || 'Sem Obra'}</div>
                                ${t.empresa ? `<div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">${t.empresa}</div>` : ''}
                                ${timeHtml}
                            </div>
                        </div>
                    </div>
                `;
            });

            const col = `
                <div style="background-color: #ffffff; border: 2px solid #e2e8f0; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="text-align: center; font-weight: 900; font-size: 18px; text-transform: uppercase; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #f1f5f9; letter-spacing: 2px; color: ${d.color || '#333'}">${name}</div>
                    <div>${tripsHtml}</div>
                </div>
            `;
            grid.innerHTML += col;
        });

        if (!rotasExistem) {
            return UI.toast("Nenhum motorista com rotas para gerar a imagem.", "error");
        }

        html2canvas(container, { 
            scale: 2, 
            useCORS: true, 
            backgroundColor: '#ffffff' 
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `SGC_Rotas_${date.replace(/\//g, '-')}_${shift}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            UI.toast("Imagem gerada e baixada com sucesso!");
        }).catch(err => {
            console.error(err);
            UI.toast("Erro ao gerar imagem.", "error");
        });
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
    // 🔥 NOVA: OBSERVAÇÃO EXTRA (NEGRITO NO WPP) 🔥
    addExtraObs(name, index) {
        const d = State.getCurrentFleet()[name];
        if(!d || !d.trips[index]) return;
        const current = d.trips[index].obsExtra || '';
        const newObs = prompt("OBSERVAÇÃO EXTRA (Sairá em negrito no WhatsApp):", current);
        if (newObs !== null) {
            d.trips[index].obsExtra = newObs.trim();
            State.saveFleet();
            App.renderSpreadsheet();
            UI.toast("OBS Extra adicionada!");
        }
    },

    // 🔥 NOVA: ANEXAR FOTO DE OBSERVAÇÃO 🔥
    attachPhotoObs(name, index) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            UI.toast("Comprimindo e anexando foto...", "info");
            
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (ev) => {
                const img = new Image();
                img.src = ev.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800; // Trava o tamanho pra não estourar o banco
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > MAX_WIDTH) {
                        height = Math.round((height * MAX_WIDTH) / width);
                        width = MAX_WIDTH;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const base64 = canvas.toDataURL('image/jpeg', 0.5); // Comprime a foto
                    
                    const d = State.getCurrentFleet()[name];
                    if(d && d.trips[index]) {
                        d.trips[index].fotoObs = base64;
                        State.saveFleet();
                        App.renderSpreadsheet();
                        UI.toast("Foto da observação anexada!");
                    }
                };
            };
        };
        input.click();
    },

    removePhotoObs(name, index) {
        if(confirm("Apagar a foto de observação anexada?")) {
            const d = State.getCurrentFleet()[name];
            if(d && d.trips[index]) {
                d.trips[index].fotoObs = null;
                State.saveFleet();
                App.renderSpreadsheet();
            }
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

    forceUnlockAgenda(id) {
        if(!confirm("Tem certeza que deseja desbloquear este serviço? (Use isso caso ele tenha sumido da rota dos motoristas).")) return;
        
        const ag = State.data.agendamentos.find(a => a.id === id);
        if(ag) {
            ag.distribuido = false;
            State.saveAgendamentos();
            
            this.renderAgendaTab();
            this.renderAgendaPanel();
            UI.toast("Serviço destravado com sucesso!");
        }
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
