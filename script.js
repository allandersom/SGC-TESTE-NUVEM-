'use strict';

// ============================================================================
// SUAS CHAVES DO FIREBASE
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
        // NOMES LIMPOS (SEM PONTO FINAL PRA NÃO TRAVAR O FIREBASE)
        day: ["MARIO", "ADRIELSON", "MESSIAS", "MARCELO A", "JAMERSON", "MANSUETO", "JOAO VICTOR", "LUIZ CARLOS RODRIGUES", "JONES", "EMERSON", "MATHEUS", "JACKSON", "ROBERTO C", "RODRIGO", "CLOVIS", "JOELITON"],
        night: ["ELCIDES", "MARCONI", "LUIZ RODRIGO", "MAYKEL", "PLATINIS", "BRUNO"]
    },
    colors: ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#db2777', '#dc2626', '#0891b2', '#ea580c']
};

const State = {
    data: { fleet: {}, addressBook: [], disposalPoints: [] }, 
    session: { currentDriver: null, shift: 'day', type: 'troca', routeDate: '' },
    tempQueue: [],
    isInitializing: true,

    init() {
        if (!this.session.routeDate) {
            this.session.routeDate = new Date().toISOString().split('T')[0];
        }
        
        UI.loading(true);

        db.ref('sgc_data').on('value', (snapshot) => {
            const val = snapshot.val();
            if (val) {
                this.data = val;
                if(!this.data.addressBook) this.data.addressBook = [];
                if(!this.data.disposalPoints) this.data.disposalPoints = [];
                if(!this.data.fleet) this.data.fleet = {};
            } else {
                this.resetFleet();
            }
            
            this.integrityCheck();

            App.renderGrid();
            App.renderList();
            App.renderAddressBook();
            App.renderDisposalList();
            App.renderSpreadsheet(); 
            
            if (this.session.currentDriver) {
                App.renderMiniHistory(this.session.currentDriver);
            }

            if (this.isInitializing) {
                this.isInitializing = false;
                UI.loading(false);
            }
        });
    },

    integrityCheck() {
        let changed = false;
        const all = [...CONFIG.drivers.day, ...CONFIG.drivers.night];
        all.forEach((name, i) => {
            if (!this.data.fleet[name]) {
                this.data.fleet[name] = { 
                    trips: [], 
                    plate: '', 
                    color: CONFIG.colors[i % CONFIG.colors.length] 
                };
                changed = true;
            } else if (!this.data.fleet[name].trips) {
                this.data.fleet[name].trips = [];
            }
        });
        if (changed && !this.isInitializing) this.save();
    },

    save() {
        if (this.isInitializing) return;
        db.ref('sgc_data').set(this.data);
    },

    resetFleet() {
        const book = this.data.addressBook || [];
        const disposal = this.data.disposalPoints || [];
        this.data.fleet = {};
        this.data.addressBook = book;
        this.data.disposalPoints = disposal;
        this.integrityCheck();
        if (!this.isInitializing) this.save();
    },

    getDriver(name) { return this.data.fleet[name]; },
    
    getDriversByShift() {
        return this.session.shift === 'day' ? CONFIG.drivers.day : CONFIG.drivers.night;
    },

    addTrip(driverName, tripData) {
        const driver = this.data.fleet[driverName];
        if (!driver) return;
        tripData.id = Date.now() + Math.random();
        driver.trips.push(tripData);
        this.save();
    },

    removeTrip(driverName, index) {
        this.data.fleet[driverName].trips.splice(index, 1);
        this.save();
    },
    
    updateTripText(driverName, index, company, obra, obs) {
        if(this.data.fleet[driverName] && this.data.fleet[driverName].trips[index]) {
            this.data.fleet[driverName].trips[index].empresa = company;
            this.data.fleet[driverName].trips[index].obra = obra;
            if (obs !== undefined) this.data.fleet[driverName].trips[index].obs = obs;
            this.save();
        }
    },

    toggleTripStatus(driverName, index) {
        const trip = this.data.fleet[driverName].trips[index];
        trip.completed = !trip.completed;
        this.save();
    },
    
    updateTripType(driverName, index, newType) {
        if(this.data.fleet[driverName] && this.data.fleet[driverName].trips[index]) {
            this.data.fleet[driverName].trips[index].type = newType;
            this.save();
        }
    },

    updateTripQty(driverName, index, newQty) {
        if(this.data.fleet[driverName] && this.data.fleet[driverName].trips[index]) {
            const qty = parseInt(newQty);
            if(qty > 0) {
                this.data.fleet[driverName].trips[index].qty = qty;
                this.save();
            }
        }
    },

    addDisposalPoint(name, address) {
        this.data.disposalPoints.push({ id: Date.now(), name, address });
        this.save();
    },
    
    removeDisposalPoint(id) {
        this.data.disposalPoints = this.data.disposalPoints.filter(d => d.id !== id);
        this.save();
    },

    updateDescarte(driverName, index, location) {
        const trip = this.data.fleet[driverName].trips[index];
        if (trip) {
            trip.descarteLocal = location;
            this.save();
        }
    },

    updatePlate(driverName, plate) {
        this.data.fleet[driverName].plate = plate.toUpperCase();
        this.save();
    },

    addToAddressBook(company, name, address) {
        const safeName = (name || "Sem Nome").trim();
        const safeCompany = (company || "").trim();
        
        const exists = this.data.addressBook.find(i => 
            i.name.toLowerCase() === safeName.toLowerCase() && 
            i.company.toLowerCase() === safeCompany.toLowerCase()
        );

        if (!exists) {
            this.data.addressBook.push({ 
                id: Date.now(), 
                company: safeCompany, 
                name: safeName, 
                address: address 
            });
            this.save();
            return true; 
        }
        return false; 
    },
    
    removeFromAddressBook(id) {
        this.data.addressBook = this.data.addressBook.filter(item => item.id !== id);
        this.save();
    },

    searchAddressBook(query) {
        if (!query) return [];
        const q = query.toLowerCase();
        return this.data.addressBook.filter(item => 
            (item.name && item.name.toLowerCase().includes(q)) || 
            (item.company && item.company.toLowerCase().includes(q))
        ).slice(0, 5);
    }
};

const WhatsappService = {
    generateShiftIcon(shift) { return shift === 'day' ? 'DIA' : 'NOITE'; },
    
    getPluralLabel(type, qty) {
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
            if (t.obs) msg += `*\`OBS: ${t.obs.toUpperCase()}\`*\n`;
            if (t.empresa) msg += `${t.empresa.toUpperCase()}\n`;

            let typeHeader = "";
            if (t.type === 'encher') {
                const q = t.qty;
                const l1 = q > 1 ? 'COLOCAÇÕES' : 'COLOCAÇÃO';
                const l2 = q > 1 ? 'RETIRADAS' : 'RETIRADA';
                typeHeader = `${q} ${l1} + ${q} ${l2}`;
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
            const activeTrips = driver.trips.filter(t => !t.completed);
            
            if (activeTrips.length > 0) {
                hasContent = true;
                const plate = driver.plate ? `*[${driver.plate}]*` : '';
                msg += `>> *${name}* ${plate}\n`;
                
                for (let i = 0; i < activeTrips.length; i++) {
                    const t = activeTrips[i];
                    if(t.obs) msg += `*\`OBS: ${t.obs.toUpperCase()}\`*\n`;
                    if (t.empresa) msg += `${t.empresa.toUpperCase()}\n`;

                    let header = "";
                    if (t.type === 'encher') {
                        const q = t.qty;
                        const l1 = q > 1 ? 'COLOCAÇÕES' : 'COLOCAÇÃO';
                        const l2 = q > 1 ? 'RETIRADAS' : 'RETIRADA';
                        header = `*${q} ${l1} + ${q} ${l2}*`;
                    } else {
                        header = `*${t.qty} ${this.getPluralLabel(t.type, t.qty)}*`;
                    }
                    msg += `${header}\n`;

                    if (t.obra) msg += `OBRA: ${t.obra.toUpperCase()}\n`;
                    
                    const addressText = typeof t.to === 'string' ? t.to : (t.to && t.to.text ? t.to.text : '');
                    const displayEnd = this.formatAddress(addressText).toUpperCase();
                    msg += `END: ${displayEnd}\n`;
                    
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
            UI.toast("Nenhuma rota para enviar.", "info");
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
                if (importedData.fleet) {
                    const cleanFleet = {};
                    for (const key in importedData.fleet) {
                        const cleanKey = key.replace(/\./g, '');
                        cleanFleet[cleanKey] = importedData.fleet[key];
                    }
                    importedData.fleet = cleanFleet;
                }
                State.data = importedData; 
                State.save(); 
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

    init() {
        const dateInput = document.getElementById('route-date');
        if(dateInput) dateInput.value = State.session.routeDate;
        this.toggleSection('planning');
        App.initDBForm();
    },

    toggleSection(id) {
        ['planning', 'list', 'db'].forEach(s => {
            const el = document.getElementById(`section-${s}`);
            const arrow = document.getElementById(`arrow-${s}`);
            if (s === id) {
                if (el && el.classList.contains('hidden')) {
                    el.classList.remove('hidden');
                    if(arrow) arrow.style.transform = 'rotate(180deg)';
                } else if (el) {
                    el.classList.add('hidden');
                    if(arrow) arrow.style.transform = 'rotate(0deg)';
                }
            } else if (el) {
                el.classList.add('hidden');
                if(arrow) arrow.style.transform = 'rotate(0deg)';
            }
        });
    },

    toggleModal(id) { 
        const el = document.getElementById(id);
        if(el) el.classList.toggle('hidden'); 
    },
    
    loading(show) { document.getElementById('loading-overlay').classList.toggle('hidden', !show); },

    toast(msg, type = 'success') {
        const c = document.getElementById('toast-container');
        const el = document.createElement('div');
        const cls = type === 'success' ? 'bg-emerald-600' : (type === 'error' ? 'bg-red-500' : 'bg-blue-600');
        el.className = `${cls} text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 text-xs font-bold animate-fade-in border border-white/20`;
        el.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
        c.appendChild(el);
        setTimeout(() => el.remove(), 3500);
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
            btn.className = 'type-sel transition-all duration-200 font-bold text-lg border text-slate-500 border-slate-200 hover:bg-slate-50';
            if (t === type) {
                if(type === 'troca') btn.className = 'type-sel active bg-slate-900 text-white border-slate-900 shadow-md scale-105';
                if(type === 'colocacao') btn.className = 'type-sel active bg-red-600 text-white border-red-600 shadow-md scale-105';
                if(type === 'retirada') btn.className = 'type-sel active bg-purple-600 text-white border-purple-600 shadow-md scale-105';
                if(type === 'encher') btn.className = 'type-sel active bg-gradient-to-r from-red-600 to-purple-600 text-white shadow-md scale-105 border-0';
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
    },

    processSmartPaste() {
        const text = document.getElementById('paste-area').value;
        if (!text.trim()) return UI.toast("Cole o texto primeiro", "error");
        
        const driverName = State.session.currentDriver;
        if (!driverName) return UI.toast("Selecione um motorista", "error");

        const lines = text.split('\n');
        let count = 0;
        let notFound = 0;

        const isOldFormat = text.toUpperCase().includes('EMPRESA:');

        if (isOldFormat) {
            let buffer = { empresa: '', obra: '', end: '' };
            for (let line of lines) {
                line = line.trim();
                if(!line) continue;

                const matchEmpresa = line.match(/(?:EMPRESA|CLIENTE):\s*(.+)/i);
                if(matchEmpresa) buffer.empresa = matchEmpresa[1].trim();

                const matchObra = line.match(/(?:OBRA|LOCAL):\s*(.+)/i);
                if(matchObra) buffer.obra = matchObra[1].trim();

                const matchEnd = line.match(/(?:END|ENDEREÇO):\s*(.+)/i);
                if(matchEnd) {
                    buffer.end = matchEnd[1].trim();
                    this.createRouteFromBuffer(driverName, buffer);
                    buffer = { empresa: '', obra: '', end: '' };
                    count++;
                }
            }
        } else {
            for (let line of lines) {
                const query = line.trim();
                if(!query) continue;

                if (query.includes(':')) {
                    const parts = query.split(':');
                    const emp = parts[0].trim();
                    const obr = parts[1].trim();
                    
                    const match = State.data.addressBook.find(item => 
                        (item.name && item.name.toLowerCase() === obr.toLowerCase()) ||
                        (item.company && item.company.toLowerCase() === emp.toLowerCase() && item.name && item.name.toLowerCase() === obr.toLowerCase())
                    );

                    const inputs = {
                        empresa: emp,
                        obra: obr,
                        qty: 1,
                        type: State.session.type,
                        obs: match ? "" : "NÃO ACHOU NO BANCO",
                        to: { text: match ? match.address : "PREENCHER ENDEREÇO" },
                        mtr: null,
                        descarteLocal: null,
                        completed: false
                    };
                    State.addTrip(driverName, inputs);
                    count++;
                    if (!match) notFound++;

                } else {
                    const queryLower = query.toLowerCase();
                    const specificMatches = State.data.addressBook.filter(item => 
                        item.name && queryLower.includes(item.name.toLowerCase())
                    );

                    let finalMatches = [];

                    if (specificMatches.length > 0) {
                        finalMatches = specificMatches;
                    } else {
                        const broadMatches = State.data.addressBook.filter(item => 
                            item.company && queryLower.includes(item.company.toLowerCase())
                        );
                        finalMatches = broadMatches;
                    }

                    if (finalMatches.length > 0) {
                        finalMatches.forEach(match => {
                            const inputs = {
                                empresa: match.company || query,
                                obra: match.name || '',
                                qty: 1,
                                type: State.session.type,
                                obs: "",
                                to: { text: match.address },
                                mtr: null,
                                descarteLocal: null,
                                completed: false
                            };
                            State.addTrip(driverName, inputs);
                            count++;
                        });
                    } else {
                        const inputs = {
                            empresa: query,
                            obra: '',
                            qty: 1,
                            type: State.session.type,
                            obs: "NÃO ACHOU NO BANCO",
                            to: { text: "PREENCHER ENDEREÇO" },
                            mtr: null,
                            descarteLocal: null,
                            completed: false
                        };
                        State.addTrip(driverName, inputs);
                        count++;
                        notFound++;
                    }
                }
            }
        }

        UI.toggleModal('paste-modal');
        document.getElementById('paste-area').value = '';
        UI.openEditor(driverName);
        
        if (notFound > 0) {
            UI.toast(`${count} viagens adicionadas (${notFound} sem endereço no banco)`, "info");
        } else {
            UI.toast(`${count} viagens importadas com sucesso!`);
        }
    },

    createRouteFromBuffer(driverName, data) {
        if(!data.end) return;
        
        if(data.empresa || data.obra) {
            State.addToAddressBook(data.empresa, data.obra, data.end);
        }

        const inputs = {
            empresa: data.empresa,
            obra: data.obra,
            qty: 1,
            type: 'troca',
            obs: "",
            to: { text: data.end }, 
            mtr: null,
            descarteLocal: null,
            completed: false
        };

        State.addTrip(driverName, inputs);
    },

    openDisposalModal(tripIndex) {
        const list = document.getElementById('select-disposal-list');
        list.innerHTML = '';
        
        State.data.disposalPoints.forEach(dp => {
            const btn = document.createElement('button');
            btn.className = "w-full text-left p-3 hover:bg-green-50 rounded border-b border-slate-50 text-xs font-bold text-slate-700 flex items-center";
            btn.innerHTML = `<i class="fas fa-map-marker-alt text-green-500 mr-2"></i>${dp.name} - ${dp.address}`;
            btn.onclick = () => App.confirmDisposalSelection(tripIndex, dp);
            list.appendChild(btn);
        });
        
        if(State.data.disposalPoints.length === 0) {
            list.innerHTML = '<div class="text-center text-xs text-gray-400 p-4">Nenhum aterro cadastrado.<br>Vá em Configurações > Gerenciar Aterros.</div>';
        }

        UI.tempTripIndex = tripIndex;
        UI.toggleModal('select-disposal-modal');
    },

    confirmDisposalSelection(tripIndex, disposal) {
        const name = State.session.currentDriver;
        State.updateDescarte(name, tripIndex, disposal.name);
        UI.toggleModal('select-disposal-modal');
    },

    clearTripDisposal() {
        const name = State.session.currentDriver;
        State.updateDescarte(name, UI.tempTripIndex, null);
        UI.toggleModal('select-disposal-modal');
    },

    openMtrModal(tripIndex) {
        UI.tempTripIndex = tripIndex;
        UI.toggleModal('select-mtr-modal');
    },

    confirmMtrSelection(mtrValue) {
        const name = State.session.currentDriver;
        const trip = State.data.fleet[name].trips[UI.tempTripIndex];
        if (trip) {
            trip.mtr = mtrValue;
            State.save();
        }
        UI.toggleModal('select-mtr-modal');
    },

    clearTripMtr() {
        const name = State.session.currentDriver;
        const trip = State.data.fleet[name].trips[UI.tempTripIndex];
        if (trip) {
            trip.mtr = null;
            State.save();
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
        
        const logo = document.getElementById('app-logo');
        if (shift === 'night') {
            document.body.classList.add('night-mode');
            if(logo) logo.src = 'images.png';
        } else {
            document.body.classList.remove('night-mode');
            if(logo) logo.src = 'images.png';
        }

        UI.closeEditor();
        this.renderGrid();
    },

    updatePlate() {
        const name = State.session.currentDriver;
        if(name) State.updatePlate(name, document.getElementById('input-plate').value);
    },

    handleAutocomplete(input, type) {
        const val = input.value.toLowerCase();
        const box = document.getElementById('suggestions-box');
        
        if (val.length < 2) {
            box.classList.add('hidden');
            return;
        }

        const matches = State.searchAddressBook(val);
        
        if (matches.length > 0) {
            box.innerHTML = matches.map(item => `
                <div class="suggestion-item" onclick="App.selectSuggestion('${item.company || ''}', '${item.name}', '${item.address}')">
                    <div class="flex justify-between items-center">
                        <strong>${item.name}</strong>
                        <span class="text-[9px] bg-slate-100 px-1 rounded text-slate-500 uppercase">${item.company || 'Geral'}</span>
                    </div>
                    <div class="text-xs text-slate-400 truncate">${item.address}</div>
                </div>
            `).join('');
            box.classList.remove('hidden');
        } else {
            box.classList.add('hidden');
        }
    },

    selectSuggestion(company, name, address) {
        document.getElementById('input-empresa').value = company;
        document.getElementById('input-obra').value = name;
        document.getElementById('input-dest').value = address;
        
        document.getElementById('input-dest').classList.add('bg-blue-50', 'border-blue-200');
        setTimeout(() => document.getElementById('input-dest').classList.remove('bg-blue-50', 'border-blue-200'), 1000);

        document.getElementById('suggestions-box').classList.add('hidden');
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
            mtr: null,
            descarteLocal: null,
            completed: false
        };

        State.addTrip(name, inputs);
        
        if (inputs.obra || inputs.empresa) {
            State.addToAddressBook(inputs.empresa, inputs.obra, raw);
        }
        
        document.getElementById('input-dest').value = '';
        document.getElementById('input-obs').value = '';
        
        UI.openEditor(name);
        UI.toast("Adicionado!");
    },

    addToQueue() {
        const empresa = document.getElementById('input-empresa').value;
        const obra = document.getElementById('input-obra').value;
        const dest = document.getElementById('input-dest').value;
        
        if (!dest) return UI.toast("Preencha o endereço", "error");

        const item = {
            empresa,
            obra,
            dest,
            qty: document.getElementById('input-qty').value,
            type: State.session.type,
            obs: document.getElementById('input-obs').value,
            mtr: null
        };

        State.tempQueue.push(item);
        
        document.getElementById('input-dest').value = '';
        document.getElementById('input-obs').value = '';
        document.getElementById('input-empresa').focus(); 
        
        this.renderQueue();
        UI.toast("Adicionado à fila!");
    },

    renderQueue() {
        const container = document.getElementById('queue-container');
        const list = document.getElementById('queue-list');
        const count = document.getElementById('queue-count');
        
        list.innerHTML = '';
        count.innerText = State.tempQueue.length;

        if (State.tempQueue.length > 0) {
            container.classList.remove('hidden');
            State.tempQueue.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = "flex justify-between items-center text-[10px] bg-white p-1 rounded border border-blue-100";
                div.innerHTML = `<span class="truncate font-bold text-blue-800">${index+1}. ${item.empresa || 'Empresa'} - ${item.dest}</span>`;
                list.appendChild(div);
            });
        } else {
            container.classList.add('hidden');
        }
    },

    processQueue() {
        const name = State.session.currentDriver;
        if (!name || State.tempQueue.length === 0) return;

        for (const item of State.tempQueue) {
            this.addRouteFromData(name, item);
        }

        State.tempQueue = [];
        this.renderQueue();
        UI.toast("Fila processada com sucesso!");
    },

    addRouteFromData(name, data) {
        const inputs = {
            empresa: data.empresa,
            obra: data.obra,
            qty: data.qty,
            type: data.type,
            obs: data.obs,
            to: { text: data.dest },
            mtr: data.mtr || null,
            descarteLocal: null,
            completed: false
        };

        State.addTrip(name, inputs);
        
        if (inputs.obra || inputs.empresa) {
            State.addToAddressBook(inputs.empresa, inputs.obra, data.dest);
        }
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

        const saved = State.addToAddressBook(c, n, a);
        
        if (saved) {
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
        if(confirm("Remover este endereço?")) {
            State.removeFromAddressBook(id);
        }
    },

    renderAddressBook() {
        const el = document.getElementById('db-list');
        if(!el) return;
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
        if(!el) return;
        el.innerHTML = '';
        State.getDriversByShift().forEach(name => {
            const d = State.getDriver(name);
            if (!d) return; 
            const pending = d.trips ? d.trips.filter(t => !t.completed).length : 0;
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

    // =========================================================================
    // NOVO CÓDIGO DA PLANILHA GIGANTE NA DIREITA
    // =========================================================================
    renderSpreadsheet() {
        const container = document.getElementById('spreadsheet-view');
        if(!container) return;
        container.innerHTML = '';
        
        const drivers = State.getDriversByShift();
        
        drivers.forEach(name => {
            const d = State.getDriver(name);
            if (!d) return;
            
            const col = document.createElement('div');
            col.className = "flex-shrink-0 w-[280px] flex flex-col bg-slate-100 border border-slate-300 rounded shadow-sm max-h-full overflow-hidden";
            
            const header = document.createElement('div');
            header.className = "text-center font-black text-[12px] py-2 uppercase shadow-sm shrink-0 flex items-center justify-center gap-2";
            header.style.backgroundColor = d.color;
            header.style.color = "#ffffff";
            header.innerHTML = `<i class="fas fa-truck"></i> ${name}`;
            col.appendChild(header);

            const tripsContainer = document.createElement('div');
            tripsContainer.className = "p-2 space-y-2 overflow-y-auto custom-scroll flex-1";

            if (d.trips && d.trips.length > 0) {
                d.trips.forEach((t, i) => {
                    const tripCard = document.createElement('div');
                    tripCard.className = `p-2 border border-slate-200 rounded-md text-[10px] leading-tight relative shadow-sm ${t.completed ? 'opacity-50 grayscale bg-slate-200' : 'bg-white hover:border-blue-300'} transition cursor-pointer`;
                    
                    // CORES DOS SERVIÇOS
                    let typeHtml = '';
                    if (t.type === 'colocacao') {
                        typeHtml = `<span class="text-red-600 font-black text-[11px]"><i class="fas fa-arrow-down"></i> ${t.qty} COLOCAÇÃO</span>`;
                    } else if (t.type === 'retirada') {
                        typeHtml = `<span class="text-purple-600 font-black text-[11px]"><i class="fas fa-arrow-up"></i> ${t.qty} RETIRADA</span>`;
                    } else if (t.type === 'troca') {
                        typeHtml = `<span class="text-slate-900 font-black text-[11px]"><i class="fas fa-sync-alt"></i> ${t.qty} TROCA</span>`;
                    } else if (t.type === 'encher') {
                        typeHtml = `<span class="text-red-600 font-black text-[11px]"><i class="fas fa-fill"></i> ${t.qty} ENCHER</span> E <span class="text-purple-600 font-black text-[11px]">NA HORA</span>`;
                    }
                    
                    const empresaHtml = t.empresa ? `<div class="font-bold mt-1.5 text-[11px] text-slate-800">${t.empresa.toUpperCase()}</div>` : '';
                    const obraHtml = t.obra ? `<div class="text-slate-600 font-semibold italic mt-0.5">${t.obra.toUpperCase()}</div>` : '';
                    
                    const addressText = typeof t.to === 'string' ? t.to : (t.to && t.to.text ? t.to.text : '');
                    const displayEnd = WhatsappService.formatAddress(addressText).toUpperCase();

                    tripCard.innerHTML = `
                        <div class="border-b border-slate-100 pb-1 mb-1 text-center bg-slate-50 -mx-2 -mt-2 p-1 rounded-t-md">
                            ${typeHtml}
                        </div>
                        ${empresaHtml}
                        ${obraHtml}
                        <div class="text-[9px] text-slate-500 mt-1.5 leading-snug"><i class="fas fa-map-marker-alt text-red-400 mr-1"></i>${displayEnd}</div>
                        ${t.obs ? `<div class="text-[9px] text-amber-700 bg-amber-50 mt-1.5 p-1 rounded border border-amber-200 font-bold"><i class="fas fa-exclamation-triangle mr-1"></i>${t.obs}</div>` : ''}
                        ${t.mtr ? `<div class="text-[8px] text-indigo-700 bg-indigo-50 mt-1 p-1 rounded border border-indigo-200 font-bold"><i class="fas fa-file-invoice mr-1"></i>${t.mtr}</div>` : ''}
                    `;
                    
                    // Clicar na viagem na planilha marca como completada
                    tripCard.onclick = () => App.toggleStatus(name, i);
                    
                    tripsContainer.appendChild(tripCard);
                });
            } else {
                tripsContainer.innerHTML = '<div class="text-center text-[10px] text-slate-400 py-4 font-semibold opacity-50"><i class="fas fa-check-circle text-2xl mb-2 block"></i>Livre</div>';
            }
            
            col.appendChild(tripsContainer);
            container.appendChild(col);
        });
    },

    renderMiniHistory(name) {
        const el = document.getElementById('mini-history');
        if(!el) return;
        el.innerHTML = '';
        const driver = State.getDriver(name);
        if(!driver || !driver.trips || driver.trips.length === 0) { el.innerHTML = '<div class="text-[9px] text-slate-300 text-center py-2">Sem viagens hoje</div>'; return; }
        
        driver.trips.slice().reverse().forEach((t, revIndex) => {
            const realIndex = driver.trips.length - 1 - revIndex;
            const row = document.createElement('div');
            row.className = "flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100 mb-1 animate-fade-in";
            const obsText = t.obs ? `<span class="text-[8px] text-amber-600 block italic">Obs: ${t.obs}</span>` : '';
            const companyTag = t.empresa ? `<span class="text-[7px] bg-slate-200 px-1 rounded mr-1">${t.empresa}</span>` : '';
            
            let displayType = t.type.toUpperCase();
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

    handleDragStart(e, driverName, index) {
        this.dragSource = { driver: driverName, index: index };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify(this.dragSource));
        setTimeout(() => e.target.classList.add('opacity-50', 'bg-blue-50'), 0);
    },

    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault(); 
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    },

    handleDrop(e, targetDriverName, targetIndex) {
        e.stopPropagation();
        
        document.querySelectorAll('.timeline-item').forEach(el => {
            el.classList.remove('opacity-50', 'bg-blue-50');
        });

        const source = this.dragSource;
        if (!source || source.driver !== targetDriverName) {
            UI.toast("Mova apenas dentro do mesmo motorista", "error");
            return false;
        }

        if (source.index === targetIndex) return false;

        const driver = State.getDriver(source.driver);
        const movedItem = driver.trips.splice(source.index, 1)[0];
        driver.trips.splice(targetIndex, 0, movedItem);
        
        State.save();
        
        return false;
    },

    renderList() {
        const container = document.getElementById('monitoring-list');
        if(!container) return;
        container.innerHTML = '';
        const drivers = State.getDriversByShift();
        
        drivers.forEach(name => {
            const d = State.getDriver(name);
            if(!d || !d.trips || !d.trips.length) return;
            
            const card = document.createElement('div');
            card.className = "bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm";
            
            let html = `
                <div onclick="this.nextElementSibling.classList.toggle('hidden')" class="p-3 bg-slate-50/50 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition border-b border-slate-100">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg text-white text-xs flex items-center justify-center font-bold shadow-sm" style="background:${d.color}">${name.substring(0,2)}</div>
                        <div>
                            <span class="font-bold text-xs text-slate-700 block">${name}</span>
                            ${d.plate ? '<span class="text-[9px] text-slate-400 font-mono tracking-tight">'+d.plate+'</span>' : ''}
                        </div>
                    </div>
                    <span class="text-[10px] bg-white px-2 py-0.5 rounded-full border border-slate-200 font-bold text-slate-500">${d.trips.length} rotas</span>
                </div>
                <div class="p-3 space-y-3">
            `;

            d.trips.forEach((t, i) => {
                const descarteClass = t.descarteLocal ? 'active bg-red-50 border-red-200 text-red-500' : 'text-slate-300 hover:text-slate-500 border-transparent';
                
                const descarteDisplay = t.descarteLocal 
                    ? `<div class="mt-1.5 flex flex-wrap items-center gap-1">
                          <div class="text-[9px] font-bold text-red-500 flex items-center gap-1.5 p-1 bg-red-50 rounded border border-red-100 w-fit"><i class="fas fa-trash-arrow-up"></i> DESCARTAR EM: ${t.descarteLocal}</div>
                        </div>` 
                    : '';

                const obsDisplay = t.obs ? `<div class="mt-1 text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 w-fit"><i class="fas fa-comment-dots text-[8px] mr-1"></i>${t.obs}</div>` : '';
                const companyDisplay = t.empresa ? `<span class="text-[8px] font-bold text-blue-600 bg-blue-50 px-1 rounded mr-1">${t.empresa}</span>` : '';

                let displayType = t.type.toUpperCase();
                if(t.type === 'encher') displayType = 'ENCHER NA HORA';
                
                const addressText = typeof t.to === 'string' ? t.to : (t.to && t.to.text ? t.to.text : '');

                const addressHtml = addressText === "PREENCHER ENDEREÇO" 
                    ? `<button onclick="App.editTripAddress('${name}',${i})" class="mt-0.5 text-[9px] bg-red-50 text-red-600 font-bold px-1.5 py-0.5 rounded border border-red-200 hover:bg-red-100 animate-pulse"><i class="fas fa-map-marker-alt"></i> CLIQUE PARA PREENCHER ENDEREÇO</button>`
                    : `<div onclick="App.editTripAddress('${name}',${i})" class="text-[10px] text-slate-400 truncate cursor-pointer hover:text-blue-500" title="Clique para editar endereço">${WhatsappService.formatAddress(addressText)} <i class="fas fa-pen text-[8px] opacity-50"></i></div>`;

                const mtrDisplay = t.mtr 
                    ? `<div class="mt-1 text-[8px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 w-fit"><i class="fas fa-file-invoice mr-1"></i>${t.mtr.includes('MOTORISTA') ? 'MTR: PEGAR NA OBRA' : t.mtr.includes('LOGÍSTICA') ? 'MTR: RESP. LOGÍSTICA' : 'MTR: DIRETO BALANÇA'}</div>`
                    : '';

                html += `
                <div class="timeline-item ${t.completed ? 'opacity-50 grayscale' : ''}"
                     draggable="true"
                     ondragstart="App.handleDragStart(event, '${name}', ${i})"
                     ondragover="App.handleDragOver(event)"
                     ondrop="App.handleDrop(event, '${name}', ${i})"
                     style="cursor: grab;"
                >
                    <div onclick="App.toggleStatus('${name}',${i})" class="timeline-dot ${t.completed?'completed':''}">${t.completed?'<i class="fas fa-check text-[8px]"></i>':''}</div>
                    <div class="flex justify-between items-start pl-2">
                        <div class="flex-1 min-w-0 pr-2">
                            <div class="flex flex-wrap gap-1 mb-0.5 items-center">
                                <div class="mr-1.5 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing" title="Arrastar para reordenar"><i class="fas fa-grip-vertical text-[10px]"></i></div>
                                
                                <div class="flex items-center gap-1 mr-1">
                                     <button onclick="App.changeQty('${name}',${i})" class="text-[10px] font-black text-slate-800 hover:text-blue-600 border-b border-dotted border-slate-300 min-w-[1.2rem]" title="Mudar Qtd">${t.qty}</button>
                                     <button onclick="App.cycleType('${name}',${i})" class="text-[10px] font-black text-slate-800 hover:text-blue-600 border-b border-dotted border-slate-300" title="Mudar Tipo">${displayType}</button>
                                </div>
                                <span class="text-[10px] text-slate-500 truncate">- ${companyDisplay}${t.obra || ''}</span>
                                <button onclick="App.editTripText('${name}',${i})" class="text-[10px] text-blue-400 hover:text-blue-600 ml-1" title="Editar Texto"><i class="fas fa-pen"></i></button>
                            </div>
                            ${addressHtml}
                            ${mtrDisplay}
                            ${obsDisplay}
                            ${descarteDisplay}
                        </div>
                        <div class="flex gap-1 shrink-0">
                            <button onclick="App.editObs('${name}',${i})" class="btn-descarte w-7 h-7 border rounded flex items-center justify-center text-blue-400 hover:bg-blue-50 border-blue-100" title="Adicionar Observação"><i class="fas fa-cloud text-xs"></i></button>
                            <button onclick="App.openMtrModal(${i})" class="btn-descarte w-7 h-7 border rounded flex items-center justify-center ${t.mtr ? 'text-indigo-500 bg-indigo-50 border-indigo-200' : 'text-slate-300 hover:text-slate-500 border-transparent'}" title="Definir MTR"><i class="fas fa-file-invoice text-xs"></i></button>
                            <button onclick="App.openDisposalModal(${i})" class="btn-descarte w-7 h-7 border rounded flex items-center justify-center ${descarteClass}" title="Definir Descarte"><i class="fas fa-recycle text-xs"></i></button>
                            <button onclick="App.deleteTrip('${name}',${i})" class="w-7 h-7 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition"><i class="fas fa-times text-xs"></i></button>
                        </div>
                    </div>
                </div>`;
            });

            html += `
                <div class="mt-3 pt-3 border-t border-slate-100">
                    <button onclick="App.shareDriverRoute('${name}')" class="w-full py-3 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md">
                        <i class="fab fa-whatsapp text-lg"></i> ENVIAR ROTA (MOTORISTA)
                    </button>
                </div>
                </div>`;
            
            card.innerHTML = html;
            container.appendChild(card);
        });
    },
    
    quickDelete(name, index) {
        if(confirm("Excluir viagem rápida?")) {
            State.removeTrip(name, index);
        }
    },
    deleteTrip(name, index) {
        if(confirm("Apagar esta entrega?")) {
            State.removeTrip(name, index);
        }
    },
    toggleStatus(n, i) { State.toggleTripStatus(n, i); },
    
    cycleType(name, index) {
        const d = State.getDriver(name);
        if(!d || !d.trips[index]) return;
        
        const types = ['troca', 'colocacao', 'retirada', 'encher'];
        const current = d.trips[index].type;
        
        let nextIndex = types.indexOf(current) + 1;
        if (nextIndex >= types.length || nextIndex === -1) nextIndex = 0;
        
        State.updateTripType(name, index, types[nextIndex]);
    },
    
    editTripText(name, index) {
        const d = State.getDriver(name);
        if(!d || !d.trips[index]) return;
        
        const currentCompany = d.trips[index].empresa || '';
        const currentObra = d.trips[index].obra || '';
        const currentObs = d.trips[index].obs || ''; 
        
        const newCompany = prompt("Editar Empresa:", currentCompany);
        if(newCompany === null) return; 
        
        const newObra = prompt("Editar Obra:", currentObra);
        if(newObra === null) return; 

        const newObs = prompt("Editar Observação:", currentObs);
        if (newObs === null) return;

        State.updateTripText(name, index, newCompany, newObra, newObs);
    },

    editTripAddress(name, index) {
        const d = State.getDriver(name);
        if(!d || !d.trips[index]) return;
        
        const trip = d.trips[index];
        const currentAddr = (typeof trip.to === 'string' ? trip.to : (trip.to && trip.to.text ? trip.to.text : ''));
        
        const newAddr = prompt("Digite o endereço correto:", currentAddr === "PREENCHER ENDEREÇO" ? "" : currentAddr);
        
        if (newAddr !== null && newAddr.trim() !== "") {
            const finalAddr = newAddr.trim();
            trip.to = { text: finalAddr };
            
            if (trip.obs === "NÃO ACHOU NO BANCO") {
                trip.obs = "";
            }
            State.save();
            
            if (trip.empresa || trip.obra) {
                State.addToAddressBook(trip.empresa, trip.obra, finalAddr);
            }
            
            UI.toast("Endereço salvo na viagem e no banco!");
        }
    },
    
    editObs(name, index) {
        const d = State.getDriver(name);
        const currentObs = d.trips[index].obs || '';
        const newObs = prompt("Adicionar/Editar Observação:", currentObs);
        if (newObs !== null) {
            d.trips[index].obs = newObs;
            State.save();
        }
    },

    changeQty(name, index) {
        const d = State.getDriver(name);
        if(!d || !d.trips[index]) return;
        
        const current = d.trips[index].qty;
        const newQty = prompt("Nova quantidade:", current);
        
        if(newQty !== null) {
            State.updateTripQty(name, index, newQty);
        }
    },

    setDescarte(n, i) {
       this.openDisposalModal(i);
    },

    shareDriverRoute(name) {
        const d = State.getDriver(name);
        const active = d.trips.filter(t => !t.completed);
        if (!active.length) return UI.toast("Sem rotas pendentes", "info");
        
        let msg = WhatsappService.buildMessage(name, active, State.session.shift, d.plate);
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
};

window.onload = () => UI.init();
