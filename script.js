import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, set, get, remove, onDisconnect, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
        
        this.currentThemeList = []; 
        this.currentThemeType = 'normal';
        this.currentThemeTitle = "";
        
        // ★修正: 結果表示済みフラグを追加
        this.hasShownResult = false;
        
        this.onConfirmCallback = null;
        
        this.init();
    }

    init() {
        this.loadThemeDeck('normal');
        this.setupEventListeners();
        this.setupSortable();
        this.checkSession();
    }

    checkSession() {
        const savedRoom = sessionStorage.getItem('ito_room');
        const savedName = sessionStorage.getItem('ito_name');
        if (savedRoom && savedName) {
            this.usernameInput.value = savedName;
            this.roomInput.value = savedRoom;
            setTimeout(() => this.joinRoom(true), 100);
        }
    }

    setupSortable() {
        new Sortable(this.fieldArea, {
            animation: 200,
            ghostClass: 'sortable-ghost',
            onEnd: () => {
                if (!this.currentRoomId) return;
                const newOrder = Array.from(this.fieldArea.children).map(card => card.dataset.id);
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
        const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#009688', '#4caf50', '#8bc34a', '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
        const index = Math.abs(hash % colors.length);
        return colors[index];
    }

    showConfirm(message, callback) {
        this.confirmMsg.textContent = message;
        this.onConfirmCallback = callback;
        this.confirmModal.classList.remove('hidden');
    }

    async joinRoom(isRejoin = false) {
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

        const roomRef = ref(db, `rooms/${room}`);
        const snapshot = await get(roomRef);
        let roomData = snapshot.val();

        if (roomData && (!roomData.members || Object.keys(roomData.members).length === 0)) {
            console.log("古いデータが残っていたため、自動リセットしました");
            await remove(roomRef);
            roomData = null;
        }

        if (roomData && roomData.members) {
            // ちなみに101人以上入るとFirebaseの無料枠制限で接続エラーが起きる可能性があります
            if (Object.keys(roomData.members).length >= 100 && !isRejoin) {
                alert("満員です（最大100人）");
                return;
            }
            // 名前重複チェック
            if (!isRejoin) {
                const isNameTaken = Object.values(roomData.members).some(m => m.name === name);
                if (isNameTaken) { 
                    alert("その名前は既に使用されています。"); 
                    sessionStorage.removeItem('ito_room');
                    sessionStorage.removeItem('ito_name');
                    return; 
                }
            }
        }

        if (!roomData || !roomData.host) {
            this.isHost = true;
            
            await this.loadThemeDeck(selectedThemeType);
            const initialTheme = this.getRandomTheme();
            
            await set(roomRef, { 
                host: name, 
                theme: initialTheme, 
                themeType: selectedThemeType, 
                status: 'playing' 
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

        const currentMembers = roomData && roomData.members ? Object.values(roomData.members) : [];
        const amIMember = currentMembers.some(m => m.name === this.myName);
        
        if (!amIMember) {
            const membersRef = ref(db, `rooms/${this.currentRoomId}/members`);
            this.myMemberRef = push(membersRef, { name: this.myName, joinedAt: Date.now() });
            onDisconnect(this.myMemberRef).remove();
        } else {
            // 既にメンバーにいる場合はRefを取り直す（再接続用）
            // ※厳密にはkeyを知る必要があるが、onDisconnect再設定のため簡易的に行うなら
            // 既存の自分のkeyを探してセットするのがベスト。ここでは簡易復帰。
            const membersKey = Object.keys(roomData.members).find(k => roomData.members[k].name === this.myName);
            if(membersKey) {
                this.myMemberRef = ref(db, `rooms/${this.currentRoomId}/members/${membersKey}`);
                onDisconnect(this.myMemberRef).remove();
            }
        }
        
        this.updateHostUI();

        this.restoreOrDrawCard(roomData);

        this.lobbyScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');

        this.startListeningToRoom();
        this.startListeningToHistory();
    }

    restoreOrDrawCard(roomData) {
        this.myCardRef = null;
        this.myNumber = null;
        let foundCard = null;
        if (roomData && roomData.cards) {
            const cards = roomData.cards;
            const cardKey = Object.keys(cards).find(key => cards[key].name === this.myName);
            if (cardKey) {
                foundCard = cards[cardKey];
                this.myCardRef = ref(db, `rooms/${this.currentRoomId}/cards/${cardKey}`);
            }
        }
        if (foundCard) {
            this.myNumber = foundCard.value;
            this.myCardElement.textContent = this.myNumber;
            this.myCardElement.classList.add('submitted');
            this.playBtn.textContent = "提出済み";
            this.playBtn.disabled = true;
            this.myCardElement.onclick = null;
        } else {
            this.drawNewCard();
        }
        this.resultOverlay.classList.add('hidden');
        // ★修正: リロード時は結果を見ていない状態に戻す（ただしstatusがrevealedならすぐ表示される）
        this.hasShownResult = false;
    }

    // 既存の drawNewCard をこれに書き換え
    async drawNewCard() {
        // まずボタンを無効化して連打防止
        this.playBtn.disabled = true;
        this.playBtn.textContent = "抽選中...";

        // 最新の部屋データを取得して、使われている番号を調べる
        const snapshot = await get(ref(db, `rooms/${this.currentRoomId}/cards`));
        const cardsObj = snapshot.val() || {};
        
        // 既に使用されている番号のリストを作成
        const usedNumbers = Object.values(cardsObj).map(card => parseInt(card.value));

        // 被らない番号を生成
        this.myNumber = this.generateUniqueNumber(usedNumbers);

        // 画面に反映
        this.myCardElement.textContent = this.myNumber;
        this.myCardElement.classList.remove('submitted');
        
        this.playBtn.textContent = "カードを出す";
        this.playBtn.disabled = false;
        this.myCardRef = null;
        this.myCardElement.onclick = null;
    }

    // ★追加: 被らない番号を生成するロジック
    generateUniqueNumber(usedNumbers) {
        // 1から100までの数字の配列を作成
        const candidates = [];
        for (let i = 1; i <= 100; i++) {
            // 使われていない数字だけを候補に入れる
            if (!usedNumbers.includes(i)) {
                candidates.push(i);
            }
        }

        // 候補が一つもない場合（100枚すべて出尽くしたなど）のエラー回避
        if (candidates.length === 0) {
            console.error("カードがすべて使用済みです");
            return 0; // エラー値
        }

        // 候補の中からランダムに1つ選ぶ
        const randomIndex = Math.floor(Math.random() * candidates.length);
        return candidates[randomIndex];
    }

    async playCard() {
        if (this.playBtn.disabled) return;

        // 現在のカード状況をデータベースから取得
        const snapshot = await get(ref(db, `rooms/${this.currentRoomId}`));
        const roomData = snapshot.val();
        
        // まだ誰もカードを出していない（またはデータがない）場合は、場所選択なしで即座に出す
        if (!roomData || !roomData.cards || Object.keys(roomData.cards).length === 0) {
            // ※このメソッドは Part 2-(4) で追加する新しい関数です
            this.executePlayCardZero(); 
            return;
        }

        // 既にカードがある場合は、選択肢を作ってモーダルを表示する
        // ※このメソッドも Part 2-(4) で追加する新しい関数です
        this.generatePositionOptions(roomData);
        this.positionModal.classList.remove('hidden');
    }

    // 選択肢の生成
    generatePositionOptions(roomData) {
        this.positionSelect.innerHTML = "";
        
        const cardsObj = roomData.cards || {};
        const orderList = roomData.order || [];
        
        // 現在画面に出ている順序でカードを並べる
        let cardsArray = Object.keys(cardsObj).map(key => ({ id: key, ...cardsObj[key] }));
        
        // メンバーとして存在している人のカードのみ対象にする（退出済みの人のカードを選択肢に出さないため）
        const members = roomData.members ? Object.values(roomData.members).map(m => m.name) : [];
        cardsArray = cardsArray.filter(c => members.includes(c.name));

        cardsArray.sort((a, b) => {
            const indexA = orderList.indexOf(a.id);
            const indexB = orderList.indexOf(b.id);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        // 選択肢1: 先頭
        const optFirst = document.createElement('option');
        optFirst.value = "first";
        optFirst.textContent = "一番左（小さい）"; // 文言微調整
        this.positionSelect.appendChild(optFirst);

        // 選択肢2以降: 各カードの後ろ
        cardsArray.forEach((card, index) => {
            const opt = document.createElement('option');
            opt.value = card.id; // このカードIDの後ろに追加する
            
            // ★修正: 最後尾の場合だけ「一番右」と表示し、それ以外は「〜の右」とシンプルにする
            if (index === cardsArray.length - 1) {
                opt.textContent = "一番右（大きい）";
            } else {
                opt.textContent = `${card.name} の右`;
            }
            
            this.positionSelect.appendChild(opt);
        });
    }

    // 場所決定時の処理
    async handlePositionSubmit() {
        const selectedValue = this.positionSelect.value;
        this.positionModal.classList.add('hidden');
        
        // 最新の並び順を取得
        const snapshot = await get(ref(db, `rooms/${this.currentRoomId}/order`));
        let currentOrder = snapshot.val() || [];
        
        // カードを保存
        const newCardRef = push(ref(db, `rooms/${this.currentRoomId}/cards`), { 
            name: this.myName, 
            value: this.myNumber 
        });
        const newCardId = newCardRef.key;
        this.myCardRef = newCardRef;

        // 配列を更新
        let newOrder = [...currentOrder];
        
        if (selectedValue === "first") {
            newOrder.unshift(newCardId);
        } else {
            const targetIndex = newOrder.indexOf(selectedValue);
            if (targetIndex !== -1) {
                // 指定位置の次に挿入
                newOrder.splice(targetIndex + 1, 0, newCardId);
            } else {
                // 見つからなければ末尾
                newOrder.push(newCardId);
            }
        }

        // 保存
        await set(ref(db, `rooms/${this.currentRoomId}/order`), newOrder);

        // ボタン更新
        this.myCardElement.classList.add('submitted');
        this.playBtn.textContent = "提出済み";
        this.playBtn.disabled = true;
    }

    // 1枚目として出す場合の処理（選択なし）
    async executePlayCardZero() {
        const newCardRef = push(ref(db, `rooms/${this.currentRoomId}/cards`), { 
            name: this.myName, 
            value: this.myNumber 
        });
        const newCardId = newCardRef.key;
        this.myCardRef = newCardRef;
        
        const snapshot = await get(ref(db, `rooms/${this.currentRoomId}/order`));
        let currentOrder = snapshot.val() || [];
        currentOrder.push(newCardId);
        await set(ref(db, `rooms/${this.currentRoomId}/order`), currentOrder);

        this.myCardElement.classList.add('submitted');
        this.playBtn.textContent = "提出済み";
        this.playBtn.disabled = true;
    }

    exitGame() {
        this.showConfirm("退出しますか？\n（あなたのカードも消えます）", async () => {
            if (this.myCardRef) await remove(this.myCardRef);
            if (this.myMemberRef) await remove(this.myMemberRef);
            sessionStorage.removeItem('ito_room');
            sessionStorage.removeItem('ito_name');
            location.reload();
        });
    }

    async revealCards() {
        if (this.revealBtn.disabled) return;
        const snapshot = await get(ref(db, `rooms/${this.currentRoomId}`));
        const roomData = snapshot.val();
        if (roomData.status === 'revealed') return;
        const { isSuccess, resultText } = this.calculateResult(roomData);
        const historyEntry = { theme: this.currentThemeTitle, isSuccess, resultDetails: resultText, timestamp: Date.now() };
        const updates = {};
        updates[`rooms/${this.currentRoomId}/status`] = 'revealed';
        const newHistoryKey = push(ref(db, `rooms/${this.currentRoomId}/history`)).key;
        updates[`rooms/${this.currentRoomId}/history/${newHistoryKey}`] = historyEntry;
        await update(ref(db), updates);
    }

    nextGame() {
        this.nextThemeSelect.value = this.currentThemeType;
        this.nextGameModal.classList.remove('hidden');
    }

    async handleNextGameOk() {
        const nextType = this.nextThemeSelect.value;
        this.nextGameModal.classList.add('hidden');

        if (nextType !== this.currentThemeType) {
            await this.loadThemeDeck(nextType);
        }
        
        const newTheme = this.getRandomTheme();
        
        update(ref(db, `rooms/${this.currentRoomId}`), {
            theme: newTheme,
            themeType: nextType, 
            status: 'playing',
            cards: null,
            order: null
        });
    }

    resetGame() {
        this.showConfirm("全データを削除しますか？\n(全員強制退出になります)", () => {
            remove(ref(db, `rooms/${this.currentRoomId}`));
        });
    }

    calculateResult(roomData) {
        if (!roomData || !roomData.cards) return { isSuccess: true, resultText: "カードなし" };
        
        const members = roomData.members ? Object.values(roomData.members).map(m => m.name) : [];
        const cardsObj = roomData.cards;
        const orderList = roomData.order || [];

        let cardsArray = Object.keys(cardsObj)
            .map(key => ({ id: key, ...cardsObj[key] }))
            .filter(card => members.includes(card.name));

        cardsArray.sort((a, b) => {
            const indexA = orderList.indexOf(a.id);
            const indexB = orderList.indexOf(b.id);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
        
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
        const roomRef = ref(db, `rooms/${this.currentRoomId}`);
        onValue(roomRef, (snapshot) => {
            const roomData = snapshot.val();
            if (!roomData) {
                sessionStorage.removeItem('ito_room');
                sessionStorage.removeItem('ito_name');
                alert("リセットされました");
                location.reload();
                return;
            }

            this.checkAndMigrateHost(roomData);

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

            // playing状態に戻ったらフラグをリセット
            if (roomData.status === 'playing') {
                this.hasShownResult = false;
            }

            if (!roomData.cards && roomData.status === 'playing') {
                this.fieldArea.innerHTML = "";
                if (this.playBtn.disabled) this.drawNewCard();
            }

            this.renderField(roomData);
            
            if (roomData.members) {
                this.renderMemberList(roomData.members, roomData.cards, roomData.host);
            } else {
                this.memberCount.textContent = "参加者: 0人";
                this.memberList.innerHTML = "";
            }

            // ★修正: まだ結果を表示していない場合のみ表示する
            if (roomData.status === 'revealed') {
                const result = this.calculateResult(roomData);
                
                if (!this.hasShownResult) {
                    this.showGameResult(result);
                    this.hasShownResult = true; // 表示済みにする
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
        const hostExists = members.some(m => m.name === roomData.host);

        if (!hostExists) {
            members.sort((a, b) => {
                if (a.joinedAt && b.joinedAt) return a.joinedAt - b.joinedAt;
                return a.id.localeCompare(b.id);
            });
            const nextHost = members[0];

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

        const membersCount = roomData.members ? Object.keys(roomData.members).length : 0;
        
        const currentMemberNames = roomData.members ? Object.values(roomData.members).map(m => m.name) : [];
        const cardsObj = roomData.cards || {};
        
        const validCardsCount = Object.values(cardsObj).filter(c => currentMemberNames.includes(c.name)).length;
        
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
            return;
        }

        const members = roomData.members ? Object.values(roomData.members).map(m => m.name) : [];
        const cardsObj = roomData.cards;
        const orderList = roomData.order || [];
        const isRevealed = (roomData.status === 'revealed');

        let cardsArray = Object.keys(cardsObj)
            .map(key => ({ id: key, ...cardsObj[key] }))
            .filter(card => members.includes(card.name));

        cardsArray.sort((a, b) => {
            const indexA = orderList.indexOf(a.id);
            const indexB = orderList.indexOf(b.id);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        this.fieldArea.innerHTML = "";
        cardsArray.forEach(cardData => {
            const newCard = document.createElement('div');
            newCard.classList.add('card', 'field-card');
            const avatarColor = this.getColorFromName(cardData.name);
            const avatarInitial = cardData.name.charAt(0);
            if (isRevealed) {
                newCard.textContent = cardData.value;
                newCard.classList.add('revealed');
            } else {
                newCard.innerHTML = `<div class="card-avatar" style="background-color: ${avatarColor}">${avatarInitial}</div><div class="card-name">${cardData.name}</div>`;
            }
            newCard.dataset.value = cardData.value;
            newCard.dataset.id = cardData.id;
            this.fieldArea.appendChild(newCard);
        });
    }

    renderMemberList(membersObj, cardsObj,hostName) {
        const members = Object.values(membersObj);
        const total = members.length;
        const submittedNames = cardsObj ? Object.values(cardsObj).map(c => c.name) : [];
        let submittedCount = 0;
        this.memberList.innerHTML = "";
        members.forEach(member => {
            const isSubmitted = submittedNames.includes(member.name);
            if (isSubmitted) submittedCount++;
            const item = document.createElement('div');
            item.classList.add('member-chip');
            const color = this.getColorFromName(member.name);
            const initial = member.name.charAt(0);
            const statusMark = isSubmitted ? '✔' : '';
            let hostLabel = "";
            if(member.name === hostName) {
                hostLabel = '<span class="host-badge">HOST</span>';
            }
            // ここでHTMLに埋め込む
            item.innerHTML = `<div class="avatar-xs" style="background-color: ${color}">${initial}</div>${member.name}${hostLabel}<span class="status-mark" style="color: ${isSubmitted ? 'green' : '#999'}">${statusMark}</span>`;
            this.memberList.appendChild(item);
        });
        this.memberCount.textContent = `提出: ${submittedCount}/${total}人 (参加: ${total}人)`;
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
        const historyRef = ref(db, `rooms/${this.currentRoomId}/history`);
        onValue(historyRef, (snapshot) => {
            const data = snapshot.val();
            this.historyList.innerHTML = "";
            if (!data) {
                this.historyList.innerHTML = "<p class='empty-msg'>まだ履歴はありません</p>";
                return;
            }
            const entries = Object.values(data).reverse();
            entries.forEach(entry => {
                const item = document.createElement('div');
                
                // ★修正: success / fail クラスを親要素にも追加してデザインしやすくする
                const statusClass = entry.isSuccess ? 'success' : 'fail';
                item.classList.add('history-item', statusClass);
                
                const statusText = entry.isSuccess ? '成功' : '失敗';
                
                // resultDetails (A(10) → B(20)) の矢印を見やすく装飾
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
    }
}

// Initialize the game
const gameManager = new GameManager();
