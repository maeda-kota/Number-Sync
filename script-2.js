import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, set, get, remove, onDisconnect, update, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ★★★ ここに自分のAPIキーを入れてください ★★★
const firebaseConfig = {
    apiKey: "AIzaSyCmjB1_CBCYXzNj_GhPUEIiGXwunqo1pbA",
    authDomain: "ito-friends-game.firebaseapp.com",
    databaseURL: "https://ito-friends-game-default-rtdb.firebaseio.com",
    projectId: "ito-friends-game",
    storageBucket: "ito-friends-game.firebasestorage.app",
    messagingSenderId: "161523652496",
    appId: "1:161523652496:web:8f7c4763a6a0f4d2208515"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function withTimeout(promise, ms = 8000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    ]);
}

// --- GameManager Class ---
class GameManager {
    constructor() {
        // DOM elements
        this.confirmMsg = document.getElementById('confirm-msg');
        this.confirmModal = document.getElementById('confirm-modal');
        this.confirmOk = document.getElementById('confirm-ok');
        this.confirmCancel = document.getElementById('confirm-cancel');
        
        this.nextGameModal = document.getElementById('next-game-modal');
        this.nextThemeSelect = document.getElementById('next-theme-select');
        this.nextOk = document.getElementById('next-ok');
        this.nextCancel = document.getElementById('next-cancel');
        
        this.roomIdDisplay = document.getElementById('room-id-display');
        // ★追加: ユーザー名表示用
        this.myNameDisplay = document.getElementById('my-name-display');
        this.lobbyThemeSelect = document.getElementById('lobby-theme-select');
        this.themeTypeDisplay = document.getElementById('theme-type-display');

        this.lobbyScreen = document.getElementById('lobby-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.usernameInput = document.getElementById('username-input');
        this.roomInput = document.getElementById('room-input');
        this.joinBtn = document.getElementById('join-btn');
        this.hostControls = document.getElementById('host-controls');
        this.fieldArea = document.getElementById('field-area');
        this.playBtn = document.getElementById('play-btn');
        this.myCardElement = document.getElementById('my-card');
        this.themeText = document.getElementById('theme-text');
        this.rangeMin = document.getElementById('range-min');
        this.rangeMax = document.getElementById('range-max');
        this.revealBtn = document.getElementById('reveal-btn');
        this.nextGameBtn = document.getElementById('next-game-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.toggleMembersBtn = document.getElementById('toggle-members');
        this.memberList = document.getElementById('member-list');
        this.memberCount = document.getElementById('member-count');
        this.resultOverlay = document.getElementById('result-overlay');
        this.resultBox = document.querySelector('.result-box');
        this.resultTitle = document.getElementById('result-title');
        this.resultDesc = document.getElementById('result-desc');
        this.resultIcon = document.getElementById('result-icon');
        this.closeResultBtn = document.getElementById('close-result');
        this.historyBtn = document.getElementById('history-btn');
        this.historyModal = document.getElementById('history-modal');
        this.closeHistoryBtn = document.getElementById('close-history');
        this.historyList = document.getElementById('history-list');
        this.exitBtn = document.getElementById('exit-btn');
        this.positionModal = document.getElementById('position-modal');
        this.positionSelect = document.getElementById('position-select');
        this.posOk = document.getElementById('pos-ok');
        this.posCancel = document.getElementById('pos-cancel');

        // Game state
        this.currentRoomId = null;
        this.myName = null;
        this.myNumber = null;
        this.myCardRef = null;
        this.myMemberRef = null;
        this.isHost = false;
        this.sortable = null; // Sortableインスタンス保持用

        this.isJoining = false;
        this.isDrawing = false;

        this.currentThemeList = [];
        this.currentThemeType = 'normal';
        this.currentThemeTitle = "";

        this.hasShownResult = false;
        this.onConfirmCallback = null;

        this._unsubRoom = null;
        this._unsubHistory = null;
        this._colorCache = {};
        this._lastFieldState = null;
        this._lastMemberState = null;
        this._awayTimer = null;
        this._isNewRoom = false;

        this.init();
    }

    init() {
        this.loadThemeDeck('normal');
        this.setupEventListeners();
        this.setupSortable();
        this.setupFieldDelegation();
        this.checkSession();
        this.cleanStaleRooms();
    }

    async cleanStaleRooms() {
        try {
            const STALE_MS = 1 * 60 * 60 * 1000;
            const now = Date.now();
            const roomsRef = ref(db, 'rooms');
            const snapshot = await get(roomsRef);
            const rooms = snapshot.val();
            if (!rooms) return;

            for (const [roomId, roomData] of Object.entries(rooms)) {
                if (!roomData.members) {
                    // メンバーがいない部屋は即削除
                    await remove(ref(db, `rooms/${roomId}`));
                    continue;
                }
                const members = Object.values(roomData.members);
                const isAnyoneOnline = members.some(m => m.isOnline === true);
                const lastActivity = roomData.lastActivity || 0;

                if (!isAnyoneOnline && (now - lastActivity) > STALE_MS) {
                    console.log(`古い部屋を削除: ${roomId}`);
                    await remove(ref(db, `rooms/${roomId}`));
                }
            }
        } catch (e) {
            console.error("cleanStaleRooms error:", e);
        }
    }

    setupFieldDelegation() {
        this._pressedCard = null;

        const showOwner = (card) => {
            if (!card.classList.contains('revealed')) return;
            this._pressedCard = card;
            card.classList.remove('revealed');
            card.classList.add('showing-owner');
            const color = card.dataset.color;
            const initial = card.dataset.name.charAt(0);
            card.innerHTML = `<div class="card-avatar" style="background-color: ${color}">${initial}</div><div class="card-name">${card.dataset.name}</div>`;
        };
        const hideOwner = () => {
            const card = this._pressedCard;
            if (!card) return;
            this._pressedCard = null;
            card.classList.remove('showing-owner');
            card.innerHTML = "";
            card.textContent = card.dataset.value;
            card.classList.add('revealed');
        };

        this.fieldArea.addEventListener('mousedown', (e) => {
            const card = e.target.closest('.field-card.revealed');
            if (!card) return;
            showOwner(card);
        });
        this.fieldArea.addEventListener('mouseup', hideOwner);
        this.fieldArea.addEventListener('mouseleave', hideOwner);
        this.fieldArea.addEventListener('touchstart', (e) => {
            const card = e.target.closest('.field-card.revealed');
            if (!card) return;
            e.preventDefault();
            showOwner(card);
        }, { passive: false });
        this.fieldArea.addEventListener('touchend', hideOwner);
    }

    checkSession() {
        const savedRoom = sessionStorage.getItem('ito_room');
        const savedName = sessionStorage.getItem('ito_name');
        if (savedRoom && savedName) {
            this.usernameInput.value = savedName;
            this.roomInput.value = savedRoom;
            
            // ★追加: 自動接続中であることを示し、ボタンを押させない
            this.joinBtn.textContent = "再接続中...";
            this.joinBtn.disabled = true;

            setTimeout(() => this.joinRoom(true), 100);
        }
    }

    setupSortable() {
        this.sortable = new Sortable(this.fieldArea, {
            animation: 200,
            ghostClass: 'sortable-ghost',
            onEnd: () => {
                if (!this.currentRoomId) return;
                const newOrder = Array.from(this.fieldArea.children).map(card => card.dataset.id);
                this._lastFieldState = newOrder.join(',') + '|0';
                set(ref(db, `rooms/${this.currentRoomId}/order`), newOrder);
            }
        });
    }

    async loadThemeDeck(type) {
        const files = {
            'normal': 'csv/normal.csv',
            'rainbow': 'csv/rainbow.csv',
            'classic': 'csv/classic.csv',
            'all': 'csv/all.csv'
        };

        const fileName = files[type] || 'csv/normal.csv';
        try {
            const response = await fetch(fileName);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const text = await response.text();
            this.currentThemeList = text.trim().split('\n').slice(1);
            this.currentThemeType = type;
            console.log(`Deck loaded: ${type} (${this.currentThemeList.length} themes)`);
        } catch (e) { 
            console.error("CSV読込エラー", e); 
            if(this.currentThemeList.length === 0) {
                this.currentThemeList = ["お題読み込み失敗,小,大"];
            }
        }
    }

    getRandomTheme() {
        if (this.currentThemeList.length === 0) return { title: "お題読込中", min: "小", max: "大" };
        const randomLine = this.currentThemeList[Math.floor(Math.random() * this.currentThemeList.length)];
        const [title, min, max] = randomLine.split(',');
        return { title, min, max };
    }

    getColorFromName(name) {
        if (!name) return '#607D8B';
        if (this._colorCache[name]) return this._colorCache[name];

        const colors = [
            '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
            '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50',
            '#8BC34A', '#C0CA33', '#FFC107', '#FF9800', '#FF5722',
            '#795548', '#607D8B', '#C62828', '#1565C0', '#2E7D32'
        ];

        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash % colors.length);
        this._colorCache[name] = colors[index];
        return colors[index];
    }

    showConfirm(message, callback) {
        this.confirmMsg.textContent = message;
        this.onConfirmCallback = callback;
        this.confirmModal.classList.remove('hidden');
    }

    async joinRoom(isRejoin = false) {
        // ★追加: 既に入室処理中なら何もしない（連打・競合防止）
        if (this.isJoining) return;
        this.isJoining = true;
        this.joinBtn.disabled = true;
        let succeeded = false;

        try {
            const name = this.usernameInput.value.trim();
            const room = this.roomInput.value.trim();
            const selectedThemeType = this.lobbyThemeSelect.value;

            if (!name || !room) { 
                alert("入力してください"); 
                return; 
            }

            if (!/^\d{3}$/.test(room)) {
                alert("部屋番号は「3桁の数字」で入力してください（例: 101）");
                return;
            }
            
            this.roomIdDisplay.textContent = room;
            // 名前表示用（もし実装済みなら）
            if(this.myNameDisplay) this.myNameDisplay.textContent = name;

            const roomRef = ref(db, `rooms/${room}`);
            const snapshot = await withTimeout(get(roomRef));
            let roomData = snapshot.val();

            // 部屋のリセット判定（全員オフライン + 2時間経過なら削除）
            if (roomData && roomData.members) {
                const members = Object.values(roomData.members);
                const isAnyoneOnline = members.some(m => m.isOnline === true);

                if (!isAnyoneOnline) {
                    const STALE_MS = 1 * 60 * 60 * 1000; // 2時間
                    const lastActivity = roomData.lastActivity || 0;
                    const isStale = (Date.now() - lastActivity) > STALE_MS;

                    if (isStale) {
                        console.log("全員オフライン＋2時間経過のため、部屋を削除します");
                        await remove(roomRef);
                        roomData = null;
                    } else {
                        // 2時間未満でも全員オフラインなら上書き（新規作成扱い）
                        console.log("全員オフラインのため、部屋をリセットして新規作成します");
                        await remove(roomRef);
                        roomData = null;
                    }
                }
            }

            if (roomData && roomData.members) {
                // 満員チェック
                if (Object.keys(roomData.members).length >= 100 && !isRejoin) {
                    alert("満員です（最大100人）");
                    return;
                }
                // 名前重複チェック
                if (!isRejoin) {
                    const existingMember = Object.values(roomData.members).find(m => m.name === name);
                    if (existingMember) {
                        if (existingMember.isOnline === false) {
                            isRejoin = true; // オフラインなら乗っ取り（再入室扱い）
                        } else {
                            alert("その名前は既に使用されています。"); 
                            sessionStorage.removeItem('ito_room');
                            sessionStorage.removeItem('ito_name');
                            return; 
                        }
                    }
                }
            }

            if (!roomData || !roomData.host) {
                this._isNewRoom = true;
                this.isHost = true;
                await this.loadThemeDeck(selectedThemeType);
                const initialTheme = this.getRandomTheme();
                
                await set(roomRef, {
                    host: name,
                    theme: initialTheme,
                    themeType: selectedThemeType,
                    status: 'playing',
                    lastActivity: Date.now()
                });
            } else if (roomData.host === name) {
                this.isHost = true;
            } else {
                this.isHost = false;
            }

            this.myName = name;
            this.currentRoomId = room;

            sessionStorage.setItem('ito_room', room);
            sessionStorage.setItem('ito_name', name);

            // メンバー登録処理
            const existingMemberEntry = Object.entries(roomData?.members || {}).find(([key, m]) => m.name === this.myName);
            
            if (!existingMemberEntry) {
                // 新規追加
                const membersRef = ref(db, `rooms/${this.currentRoomId}/members`);
                this.myMemberRef = await push(membersRef, { name: this.myName, joinedAt: Date.now(), isOnline: true });
            } else {
                // 既存更新
                const [key, val] = existingMemberEntry;
                this.myMemberRef = ref(db, `rooms/${this.currentRoomId}/members/${key}`);
                await update(this.myMemberRef, { isOnline: true });
            }

            onDisconnect(this.myMemberRef).update({ isOnline: false });
            
            this.updateHostUI();
            if (this._isNewRoom) {
                this.drawNewCard();
            } else {
                this.restoreOrDrawCard(roomData);
            }

            succeeded = true;
            this.lobbyScreen.classList.add('hidden');
            this.gameScreen.classList.remove('hidden');

            this.startListeningToRoom();
            this.startListeningToHistory();

        } catch (error) {
            console.error("Join Room Error:", error);
            alert("入室中にエラーが発生しました。");
        } finally {
            this.isJoining = false;
            if (!succeeded) {
                this.joinBtn.disabled = false;
                this.joinBtn.textContent = "部屋に入る / 作る";

                if (this.myMemberRef) {
                    remove(this.myMemberRef).catch(() => {});
                    this.myMemberRef = null;
                }
                if (this._isNewRoom && this.currentRoomId) {
                    remove(ref(db, `rooms/${this.currentRoomId}`)).catch(() => {});
                }
                this._isNewRoom = false;
                this.currentRoomId = null;
                this.myName = null;
                sessionStorage.removeItem('ito_room');
                sessionStorage.removeItem('ito_name');
            }
        }
    }

    restoreOrDrawCard(roomData) {
        this.myCardRef = null;
        this.myNumber = null;
        let foundCard = null;
        let foundCardKey = null; // キーを使って提出済みか判定します

        if (roomData && roomData.cards) {
            const cards = roomData.cards;
            // 自分の名前のカードを探す
            foundCardKey = Object.keys(cards).find(key => cards[key].name === this.myName);
            if (foundCardKey) {
                foundCard = cards[foundCardKey];
                this.myCardRef = ref(db, `rooms/${this.currentRoomId}/cards/${foundCardKey}`);
            }
        }

        if (foundCard) {
            this.myNumber = foundCard.value;
            this.myCardElement.textContent = this.myNumber;

            const orderList = roomData.order || [];
            const isSubmitted = orderList.includes(foundCardKey);

            if (isSubmitted || roomData.status === 'revealed') {
                this.myCardElement.classList.add('submitted');
                this.playBtn.textContent = roomData.status === 'revealed' ? "OPEN済" : "提出済み";
                this.playBtn.disabled = true;
                this.myCardElement.onclick = null;
            } else {
                this.myCardElement.classList.remove('submitted');
                this.playBtn.textContent = "カードを出す";
                this.playBtn.disabled = false;
                this.myCardElement.onclick = null;
            }
        } else if (roomData.status === 'revealed') {
            // OPEN後に入ったプレイヤーはカードを引けない（観戦状態）
            this.myCardElement.textContent = "-";
            this.myCardElement.classList.add('submitted');
            this.playBtn.textContent = "次のゲームまで待機";
            this.playBtn.disabled = true;
        } else {
            this.drawNewCard();
        }
        
        this.resultOverlay.classList.add('hidden');
        this.hasShownResult = false;
    }

    // ★修正: トランザクションを使った重複のないカード抽選
    async drawNewCard() {
        // ★追加: 既に引いている最中なら何もしない
        if (this.isDrawing) return;
        this.isDrawing = true;

        this.playBtn.disabled = true;
        this.playBtn.textContent = "抽選中...";

        const cardsRef = ref(db, `rooms/${this.currentRoomId}/cards`);

        try {
            await runTransaction(cardsRef, (currentCards) => {
                const cardsObj = currentCards || {};
                const usedNumbers = Object.values(cardsObj).map(c => parseInt(c.value));
                
                const nextNumber = this.generateUniqueNumber(usedNumbers);
                if (nextNumber === 0) return; 

                const newKey = 'card_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                
                if (!currentCards) {
                    return { [newKey]: { name: this.myName, value: nextNumber } };
                } else {
                    currentCards[newKey] = { name: this.myName, value: nextNumber };
                    return currentCards;
                }
            });

            const snapshot = await get(cardsRef);
            const cards = snapshot.val();
            // ★修正: 万が一カードが見つからなかった場合のガードを追加
            if (!cards) throw new Error("Card save failed (no cards)");
            
            const cardEntry = Object.entries(cards).find(([k, v]) => v.name === this.myName);
            
            if (cardEntry) {
                this.myCardRef = ref(db, `rooms/${this.currentRoomId}/cards/${cardEntry[0]}`);
                this.myNumber = cardEntry[1].value;

                this.myCardElement.textContent = this.myNumber;
                this.myCardElement.classList.remove('submitted');
                this.playBtn.textContent = "カードを出す";
                this.playBtn.disabled = false;
                this.myCardElement.onclick = null;
            } else {
                throw new Error("Card save failed (not found)");
            }

        } catch (error) {
            console.error("Draw card error:", error);
            this.showToast("カード抽選に失敗しました");
            this.playBtn.textContent = "カードを出す";
            this.playBtn.disabled = false;
        } finally {
            // ★追加: 処理が終わったらフラグを下ろす
            this.isDrawing = false;
        }
    }

    generateUniqueNumber(usedNumbers) {
        const candidates = [];
        for (let i = 1; i <= 100; i++) {
            if (!usedNumbers.includes(i)) {
                candidates.push(i);
            }
        }
        if (candidates.length === 0) return 0;
        const randomIndex = Math.floor(Math.random() * candidates.length);
        return candidates[randomIndex];
    }

    async playCard() {
        if (this.playBtn.disabled) return;

        try {
            const snapshot = await withTimeout(get(ref(db, `rooms/${this.currentRoomId}`)));
            const roomData = snapshot.val();

            if (!roomData || !roomData.order || roomData.order.length === 0) {
                await this.executePlayCardZero();
                return;
            }

            this.generatePositionOptions(roomData);
            this.positionModal.classList.remove('hidden');
        } catch (error) {
            console.error("playCard error:", error);
            this.showToast("通信エラーが発生しました");
        }
    }

    generatePositionOptions(roomData) {
        this.positionSelect.innerHTML = "";
        const cardsArray = this._getSubmittedCards(roomData);

        const optFirst = document.createElement('option');
        optFirst.value = "first";
        optFirst.textContent = "一番左（小さい）";
        this.positionSelect.appendChild(optFirst);

        cardsArray.forEach((card, index) => {
            const opt = document.createElement('option');
            opt.value = card.id;
            if (index === cardsArray.length - 1) {
                opt.textContent = "一番右（大きい）";
            } else {
                opt.textContent = `${card.name} の右`;
            }
            this.positionSelect.appendChild(opt);
        });
    }

    async handlePositionSubmit() {
        const selectedValue = this.positionSelect.value;
        this.positionModal.classList.add('hidden');

        try {
            if (!this.myCardRef) {
                const snapshot = await withTimeout(get(ref(db, `rooms/${this.currentRoomId}/cards`)));
                const cards = snapshot.val();
                const cardKey = Object.keys(cards).find(key => cards[key].name === this.myName);
                this.myCardRef = ref(db, `rooms/${this.currentRoomId}/cards/${cardKey}`);
                this.myNumber = cards[cardKey].value;
            }

            const snapshot = await withTimeout(get(ref(db, `rooms/${this.currentRoomId}/order`)));
            let currentOrder = snapshot.val() || [];
            const cardId = this.myCardRef.key;

            let newOrder = [...currentOrder];
            if (selectedValue === "first") {
                newOrder.unshift(cardId);
            } else {
                const targetIndex = newOrder.indexOf(selectedValue);
                if (targetIndex !== -1) {
                    newOrder.splice(targetIndex + 1, 0, cardId);
                } else {
                    newOrder.push(cardId);
                }
            }

            await withTimeout(set(ref(db, `rooms/${this.currentRoomId}/order`), newOrder));

            this.myCardElement.classList.add('submitted');
            this.playBtn.textContent = "提出済み";
            this.playBtn.disabled = true;
        } catch (error) {
            console.error("handlePositionSubmit error:", error);
            this.showToast("カード提出に失敗しました");
            this.playBtn.textContent = "カードを出す";
            this.playBtn.disabled = false;
        }
    }

    async executePlayCardZero() {
        try {
            if (!this.myCardRef) {
                const snapshot = await withTimeout(get(ref(db, `rooms/${this.currentRoomId}/cards`)));
                const cards = snapshot.val();
                const cardKey = Object.keys(cards).find(key => cards[key].name === this.myName);
                this.myCardRef = ref(db, `rooms/${this.currentRoomId}/cards/${cardKey}`);
            }

            const cardId = this.myCardRef.key;
            const snapshot = await withTimeout(get(ref(db, `rooms/${this.currentRoomId}/order`)));
            let currentOrder = snapshot.val() || [];
            currentOrder.push(cardId);
            await withTimeout(set(ref(db, `rooms/${this.currentRoomId}/order`), currentOrder));

            this.myCardElement.classList.add('submitted');
            this.playBtn.textContent = "提出済み";
            this.playBtn.disabled = true;
        } catch (error) {
            console.error("executePlayCardZero error:", error);
            this.showToast("カード提出に失敗しました");
            this.playBtn.textContent = "カードを出す";
            this.playBtn.disabled = false;
        }
    }

    async markMemberOffline() {
        if (!this.myMemberRef || !this.currentRoomId) return;
        try {
            await update(this.myMemberRef, { isOnline: false });
            const snap = await get(ref(db, `rooms/${this.currentRoomId}/members`));
            const members = snap.val();
            if (members) {
                const allOffline = Object.values(members).every(m => m.isOnline === false);
                if (allOffline) {
                    await remove(ref(db, `rooms/${this.currentRoomId}`));
                }
            }
        } catch (e) {
            console.error("markMemberOffline error:", e);
        }
    }

    exitGame() {
        clearTimeout(this._awayTimer);
        this.showConfirm("退出しますか？", async () => {
            if (this._unsubRoom) this._unsubRoom();
            if (this._unsubHistory) this._unsubHistory();

            // OPEN後はカードを残す（結果表示に必要）
            const snapshot = await get(ref(db, `rooms/${this.currentRoomId}/status`)).catch(() => null);
            const status = snapshot?.val();
            if (status !== 'revealed' && this.myCardRef) {
                await remove(this.myCardRef);
            }

            if (this.myMemberRef) await remove(this.myMemberRef);

            sessionStorage.removeItem('ito_room');
            sessionStorage.removeItem('ito_name');
            location.reload();
        });
    }

    async revealCards() {
        if (this.revealBtn.disabled) return;
        try {
            const snapshot = await withTimeout(get(ref(db, `rooms/${this.currentRoomId}`)));
            const roomData = snapshot.val();
            if (roomData.status === 'revealed') return;
            const { isSuccess, resultText } = this.calculateResult(roomData);
            const historyEntry = { theme: this.currentThemeTitle, isSuccess, resultDetails: resultText, timestamp: Date.now() };
            const updates = {};
            updates[`rooms/${this.currentRoomId}/status`] = 'revealed';
            updates[`rooms/${this.currentRoomId}/lastActivity`] = Date.now();
            const newHistoryKey = push(ref(db, `rooms/${this.currentRoomId}/history`)).key;
            updates[`rooms/${this.currentRoomId}/history/${newHistoryKey}`] = historyEntry;
            await withTimeout(update(ref(db), updates));
        } catch (error) {
            console.error("revealCards error:", error);
            this.showToast("OPEN処理に失敗しました");
        }
    }

    nextGame() {
        this.nextThemeSelect.value = this.currentThemeType;
        this.nextGameModal.classList.remove('hidden');
    }

    // ★修正: 「次へ」ボタンでオフラインユーザーを掃除する
    async handleNextGameOk() {
        const nextType = this.nextThemeSelect.value;
        this.nextGameModal.classList.add('hidden');

        // まずオフラインユーザーを削除
        const membersSnapshot = await get(ref(db, `rooms/${this.currentRoomId}/members`));
        const members = membersSnapshot.val();
        if (members) {
            for (const [key, member] of Object.entries(members)) {
                if (member.isOnline === false) {
                    await remove(ref(db, `rooms/${this.currentRoomId}/members/${key}`));
                    // その人のカードも消すべきだが、カード自体は次の処理で一括リセットされるのでOK
                }
            }
        }

        if (nextType !== this.currentThemeType) {
            await this.loadThemeDeck(nextType);
        }
        
        const newTheme = this.getRandomTheme();
        
        update(ref(db, `rooms/${this.currentRoomId}`), {
            theme: newTheme,
            themeType: nextType,
            status: 'playing',
            cards: null,
            order: null,
            lastActivity: Date.now()
        });
    }

    resetGame() {
        this.showConfirm("全データを削除しますか？\n(全員強制退出になります)", () => {
            remove(ref(db, `rooms/${this.currentRoomId}`));
        });
    }

    _getSubmittedCards(roomData) {
        const members = roomData.members ? Object.values(roomData.members).map(m => m.name) : [];
        const cardsObj = roomData.cards || {};
        const orderList = roomData.order || [];
        return Object.keys(cardsObj)
            .map(key => ({ id: key, ...cardsObj[key] }))
            .filter(card => members.includes(card.name) && orderList.includes(card.id))
            .sort((a, b) => orderList.indexOf(a.id) - orderList.indexOf(b.id));
    }

    calculateResult(roomData) {
        if (!roomData || !roomData.cards) return { isSuccess: true, resultText: "カードなし" };

        const cardsArray = this._getSubmittedCards(roomData);
        
        let isSuccess = true;
        let resultTextArray = [];
        for (let i = 0; i < cardsArray.length; i++) {
            const current = cardsArray[i];
            const val = parseInt(current.value);
            if (i > 0) {
                const prev = cardsArray[i-1];
                if (val < parseInt(prev.value)) isSuccess = false;
            }
            resultTextArray.push(`${current.name}(${val})`);
        }
        
        if (cardsArray.length === 0) return { isSuccess: true, resultText: "有効なカードなし" };
        
        return { isSuccess, resultText: resultTextArray.join(" → ") };
    }

    getThemeTypeLabel(type) {
        const labels = {
            'normal': 'ノーマル',
            'rainbow': 'レインボー',
            'classic': 'クラシック',
            'all': 'オールスター'
        };
        return labels[type] || 'ノーマル';
    }

    startListeningToRoom() {
        if (this._unsubRoom) this._unsubRoom();
        const roomRef = ref(db, `rooms/${this.currentRoomId}`);
        this._unsubRoom = onValue(roomRef, (snapshot) => {
            const roomData = snapshot.val();
            if (!roomData) {
                sessionStorage.removeItem('ito_room');
                sessionStorage.removeItem('ito_name');
                alert("リセットされました");
                location.reload();
                return;
            }

            if (roomData.members) {
                // ���ーストエントリ（nameなし）を自動削除
                for (const [key, val] of Object.entries(roomData.members)) {
                    if (!val.name) {
                        remove(ref(db, `rooms/${this.currentRoomId}/members/${key}`));
                    }
                }

                const isMember = Object.values(roomData.members).some(m => m.name === this.myName);
                if (!isMember) {
                    if (this._unsubRoom) this._unsubRoom();
                    if (this._unsubHistory) this._unsubHistory();
                    sessionStorage.removeItem('ito_room');
                    sessionStorage.removeItem('ito_name');
                    if (this.myMemberRef) {
                        onDisconnect(this.myMemberRef).cancel().then(() => {
                            alert("ホストによりキックされました");
                            location.reload();
                        });
                    } else {
                        alert("ホストによりキックされま��た");
                        location.reload();
                    }
                    return;
                }
            }

            const ONE_HOUR_MS = 60 * 60 * 1000;
            if (Date.now() - (roomData.lastActivity || 0) > ONE_HOUR_MS) {
                const onlineMembers = Object.values(roomData.members || {})
                    .filter(m => m.isOnline === true)
                    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
                if (onlineMembers.length > 0 && onlineMembers[0].name === this.myName) {
                    remove(ref(db, `rooms/${this.currentRoomId}`));
                }
                return;
            }

            if (roomData.members) {
                const allOffline = Object.values(roomData.members).every(m => m.isOnline === false);
                if (allOffline) {
                    remove(ref(db, `rooms/${this.currentRoomId}`));
                    return;
                }
            }

            this.checkAndMigrateHost(roomData);

            if (this.sortable) {
                const shouldDisable = (roomData.status === 'revealed');
                this.sortable.option("disabled", shouldDisable);
            }

            if (roomData.theme) {
                this.themeText.textContent = roomData.theme.title;
                this.currentThemeTitle = roomData.theme.title;
                this.rangeMin.textContent = roomData.theme.min;
                this.rangeMax.textContent = roomData.theme.max;
            }

            if (roomData.themeType) {
                this.themeTypeDisplay.textContent = this.getThemeTypeLabel(roomData.themeType);
                if (roomData.themeType !== this.currentThemeType) {
                    this.loadThemeDeck(roomData.themeType);
                }
            }

            if (roomData.status === 'playing') {
                this.hasShownResult = false;
            }

            // --- ★修正: カード自動配布ロジック ---
            // 「playing」状態なのに、自分のカードがDBにない場合は、自動で引く
            if (roomData.status === 'playing') {
                const cards = roomData.cards || {};
                const myCardExists = Object.values(cards).some(c => c.name === this.myName);

                // 自分のカードがなく、かつ現在引いている最中でなければ引く
                if (!myCardExists && !this.isDrawing) {
                    // 念のためフィールドをクリア
                    if (!roomData.cards) this.fieldArea.innerHTML = "";
                    this.drawNewCard();
                }
            }
            // ------------------------------------

            this.renderField(roomData);
            
            if (roomData.members) {
                this.renderMemberList(roomData.members, roomData.cards, roomData.host, roomData.order);
            } else {
                this.memberCount.textContent = "参加者: 0人";
                this.memberList.innerHTML = "";
            }

            if (roomData.status === 'revealed') {
                const result = this.calculateResult(roomData);
                
                if (!this.hasShownResult) {
                    this.showGameResult(result);
                    this.hasShownResult = true; 
                }
            } else {
                if (!this.resultOverlay.classList.contains('hidden') && !roomData.cards) {
                    this.resultOverlay.classList.add('hidden');
                }
            }

            this.updateHostControls(roomData);
        });
    }

    checkAndMigrateHost(roomData) {
        if (!roomData.members || !roomData.host) return;

        const members = Object.entries(roomData.members).map(([key, val]) => ({ id: key, ...val }));
        const hostMember = members.find(m => m.name === roomData.host);
        const hostIsGone = !hostMember || hostMember.isOnline === false;

        if (hostIsGone) {
            const onlineMembers = members.filter(m => m.isOnline === true);
            if (onlineMembers.length === 0) {
                this.isHost = false;
                this.updateHostUI();
                return;
            }
            onlineMembers.sort((a, b) => {
                if (a.joinedAt && b.joinedAt) return a.joinedAt - b.joinedAt;
                return a.id.localeCompare(b.id);
            });
            const nextHost = onlineMembers[0];

            if (nextHost && nextHost.name === this.myName) {
                console.log("ホスト権限を自動継承しました");
                update(ref(db, `rooms/${this.currentRoomId}`), { host: this.myName });
                roomData.host = this.myName;
            }
        }

        this.isHost = (roomData.host === this.myName);
        this.updateHostUI();
    }

    updateHostUI() {
        if (this.isHost) this.hostControls.classList.remove('hidden');
        else this.hostControls.classList.add('hidden');
    }

    updateHostControls(roomData) {
        if (!this.isHost) return;

        const validMembers = roomData.members ? Object.values(roomData.members).filter(m => m.name) : [];
        const membersCount = validMembers.length;

        // ★修正: 場に出ている(orderにある)カードだけをカウント対象にする
        const orderList = roomData.order || [];
        const cardsObj = roomData.cards || {};
        const currentMemberNames = validMembers.map(m => m.name);
        
        // orderに含まれていて、かつ現在いるメンバーのカードのみを有効とする
        let validCardsCount = 0;
        orderList.forEach(cardId => {
            const card = cardsObj[cardId];
            if (card && currentMemberNames.includes(card.name)) {
                validCardsCount++;
            }
        });
        
        if (roomData.status === 'playing') {
            if (membersCount > 1 && membersCount === validCardsCount) {
                this.revealBtn.disabled = false;
                this.revealBtn.textContent = "OPEN";
            } else {
                this.revealBtn.disabled = true;
                if (membersCount <= 1) {
                    this.revealBtn.textContent = "2人以上必要";
                } else {
                    this.revealBtn.textContent = `OPEN (${validCardsCount}/${membersCount})`;
                }
            }
        } else {
            this.revealBtn.disabled = true;
            this.revealBtn.textContent = "OPEN済";
        }
    }

    renderField(roomData) {
        if (!roomData.cards) {
            this.fieldArea.innerHTML = "";
            this._lastFieldState = null;
            return;
        }

        const cardsArray = this._getSubmittedCards(roomData);
        const isRevealed = (roomData.status === 'revealed');

        const stateKey = cardsArray.map(c => c.id).join(',') + '|' + (isRevealed ? '1' : '0');
        if (this._lastFieldState === stateKey) return;
        this._lastFieldState = stateKey;

        this.fieldArea.innerHTML = "";
        cardsArray.forEach(cardData => {
            const newCard = document.createElement('div');
            newCard.classList.add('card', 'field-card');
            newCard.dataset.value = cardData.value;
            newCard.dataset.id = cardData.id;
            newCard.dataset.name = cardData.name;
            newCard.dataset.color = this.getColorFromName(cardData.name);

            if (isRevealed) {
                newCard.textContent = cardData.value;
                newCard.classList.add('revealed');
            } else {
                const avatarColor = this.getColorFromName(cardData.name);
                const avatarInitial = cardData.name.charAt(0);
                newCard.innerHTML = `<div class="card-avatar" style="background-color: ${avatarColor}">${avatarInitial}</div><div class="card-name">${cardData.name}</div>`;
            }

            this.fieldArea.appendChild(newCard);
        });
    }

    renderMemberList(membersObj, cardsObj, hostName, orderList = []) {
        const members = Object.entries(membersObj)
            .map(([key, val]) => ({ id: key, ...val }))
            .filter(m => m.name);
        const total = members.length;

        const submittedMemberNames = [];
        if (cardsObj && orderList.length > 0) {
            orderList.forEach(cardId => {
                if (cardsObj[cardId]) {
                    submittedMemberNames.push(cardsObj[cardId].name);
                }
            });
        }

        let submittedCount = 0;
        this.memberList.innerHTML = "";

        members.forEach(member => {
            if (!member.name) return;
            const isSubmitted = submittedMemberNames.includes(member.name);
            if (isSubmitted) submittedCount++;

            const item = document.createElement('div');
            item.classList.add('member-chip');
            const color = this.getColorFromName(member.name);
            const initial = member.name.charAt(0);
            const statusMark = isSubmitted ? '✔' : '';
            let hostLabel = "";
            if (member.name === hostName) {
                hostLabel = '<span class="host-badge">HOST</span>';
            }

            let kickBtn = "";
            if (this.isHost && member.name !== this.myName) {
                kickBtn = `<button class="kick-btn" data-member-id="${member.id}" data-member-name="${member.name}" title="キック">✕</button>`;
            }

            item.innerHTML = `<div class="avatar-xs" style="background-color: ${color}">${initial}</div>${member.name}${hostLabel}<span class="status-mark" style="color: ${isSubmitted ? 'green' : '#999'}">${statusMark}</span>${kickBtn}`;
            this.memberList.appendChild(item);
        });

        this.memberList.querySelectorAll('.kick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const memberId = btn.dataset.memberId;
                const memberName = btn.dataset.memberName;
                this.kickMember(memberId, memberName);
            });
        });

        this.memberCount.textContent = `提出: ${submittedCount}/${total}人 (参加: ${total}人)`;
    }

    kickMember(memberId, memberName) {
        this.showConfirm(`「${memberName}」をキックしますか？`, async () => {
            try {
                const memberRef = ref(db, `rooms/${this.currentRoomId}/members/${memberId}`);
                await onDisconnect(memberRef).cancel();
                await remove(memberRef);

                const cardsSnap = await get(ref(db, `rooms/${this.currentRoomId}/cards`));
                const cards = cardsSnap.val();
                if (cards) {
                    const cardKeysToRemove = Object.keys(cards).filter(key => cards[key].name === memberName);
                    const orderSnap = await get(ref(db, `rooms/${this.currentRoomId}/order`));
                    let order = orderSnap.val() || [];

                    for (const cardKey of cardKeysToRemove) {
                        await remove(ref(db, `rooms/${this.currentRoomId}/cards/${cardKey}`));
                        order = order.filter(id => id !== cardKey);
                    }

                    await set(ref(db, `rooms/${this.currentRoomId}/order`), order);
                }

                this.showToast(`${memberName} をキックしました`, 'info');
            } catch (e) {
                console.error("kickMember error:", e);
                this.showToast("キックに失敗しました", 'warning');
            }
        });
    }

    showGameResult(result) {
        if (!this.resultOverlay.classList.contains('hidden')) return;
        this.resultOverlay.classList.remove('hidden');
        this.resultBox.className = "card-panel result-box";
        if (result.isSuccess) {
            this.resultBox.classList.add('success');
            this.resultIcon.textContent = "🎉";
            this.resultTitle.textContent = "MISSION COMPLETE!";
            this.resultDesc.textContent = "素晴らしい！全員の心が一つになりました！";
        } else {
            this.resultBox.classList.add('fail');
            this.resultIcon.textContent = "💀";
            this.resultTitle.textContent = "GAME OVER...";
            this.resultDesc.textContent = "残念...並び順が間違っています";
        }
    }

    startListeningToHistory() {
        if (this._unsubHistory) this._unsubHistory();
        const historyRef = ref(db, `rooms/${this.currentRoomId}/history`);
        this._unsubHistory = onValue(historyRef, (snapshot) => {
            const data = snapshot.val();
            this.historyList.innerHTML = "";
            if (!data) {
                this.historyList.innerHTML = "<p class='empty-msg'>まだ履歴はありません</p>";
                return;
            }
            const entries = Object.values(data).reverse();
            entries.forEach(entry => {
                const item = document.createElement('div');
                
                const statusClass = entry.isSuccess ? 'success' : 'fail';
                item.classList.add('history-item', statusClass);
                
                const statusText = entry.isSuccess ? '成功' : '失敗';
                const formattedDetails = entry.resultDetails.replace(/→/g, '<span class="arrow">→</span>');

                item.innerHTML = `
                    <div class="history-header">
                        <span class="history-theme">${entry.theme}</span>
                        <span class="tag ${statusClass}">${statusText}</span>
                    </div>
                    <div class="history-detail">${formattedDetails}</div>
                `;
                this.historyList.appendChild(item);
            });
        });
    }

    setupEventListeners() {
        this.joinBtn.addEventListener('click', () => this.joinRoom());
        this.playBtn.addEventListener('click', () => this.playCard());
        this.revealBtn.addEventListener('click', () => this.revealCards());
        this.nextGameBtn.addEventListener('click', () => this.nextGame());
        this.resetBtn.addEventListener('click', () => this.resetGame());
        this.exitBtn.addEventListener('click', () => this.exitGame());
        this.posOk.addEventListener('click', () => this.handlePositionSubmit());
        this.posCancel.addEventListener('click', () => this.positionModal.classList.add('hidden'));


        this.confirmOk.addEventListener('click', () => {
            this.confirmModal.classList.add('hidden');
            if (this.onConfirmCallback) {
                this.onConfirmCallback();
                this.onConfirmCallback = null;
            }
        });
        this.confirmCancel.addEventListener('click', () => {
            this.confirmModal.classList.add('hidden');
            this.onConfirmCallback = null;
        });

        this.nextOk.addEventListener('click', () => this.handleNextGameOk());
        this.nextCancel.addEventListener('click', () => this.nextGameModal.classList.add('hidden'));

        this.toggleMembersBtn.addEventListener('click', () => {
            this.memberList.classList.toggle('hidden');
            this.toggleMembersBtn.querySelector('.toggle-icon').textContent = this.memberList.classList.contains('hidden') ? '▼' : '▲';
        });
        this.closeResultBtn.addEventListener('click', () => this.resultOverlay.classList.add('hidden'));
        this.historyBtn.addEventListener('click', () => this.historyModal.classList.remove('hidden'));
        this.closeHistoryBtn.addEventListener('click', () => this.historyModal.classList.add('hidden'));
        
        window.addEventListener('click', (e) => {
            if (e.target == this.historyModal) this.historyModal.classList.add('hidden');
            if (e.target == this.confirmModal) this.confirmModal.classList.add('hidden');
            if (e.target == this.nextGameModal) this.nextGameModal.classList.add('hidden');
            if (e.target == this.resultOverlay) this.resultOverlay.classList.add('hidden');
            if (e.target == this.positionModal) this.positionModal.classList.add('hidden');
        });

        window.addEventListener('offline', () => this.showToast('オフラインです', 'warning'));
        window.addEventListener('online', () => this.showToast('接続が回復しました', 'success'));

        window.addEventListener('beforeunload', () => {
            this.markMemberOffline();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this._awayTimer = setTimeout(() => {
                    this.markMemberOffline();
                }, 10 * 60 * 1000);
            } else {
                clearTimeout(this._awayTimer);
                if (this.myMemberRef) {
                    update(this.myMemberRef, { isOnline: true });
                }
            }
        });
    }

    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

// Initialize the game
const gameManager = new GameManager();