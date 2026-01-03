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
        // ★追加: 退出ボタン
        this.exitBtn = document.getElementById('exit-btn');

        // Game state
        this.currentRoomId = null;
        this.myName = null;
        this.myNumber = null;
        this.myCardRef = null;
        this.myMemberRef = null;
        this.isHost = false;
        this.allThemes = [];
        this.currentThemeTitle = "";
        this.onConfirmCallback = null;
        
        this.init();
    }

    init() {
        this.fetchThemeData();
        this.setupEventListeners();
        this.setupSortable();
        // ★追加: セッションストレージを確認して自動再接続
        this.checkSession();
    }

    checkSession() {
        const savedRoom = sessionStorage.getItem('ito_room');
        const savedName = sessionStorage.getItem('ito_name');
        if (savedRoom && savedName) {
            // 値をセットして入室処理へ
            this.usernameInput.value = savedName;
            this.roomInput.value = savedRoom;
            // 少し待ってから実行（CSV読み込み等のため）
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

    async fetchThemeData() {
        try {
            const response = await fetch('themes.csv');
            const text = await response.text();
            this.allThemes = text.trim().split('\n').slice(1);
        } catch (e) { console.error("CSV読込エラー", e); }
    }

    getRandomTheme() {
        if (this.allThemes.length === 0) return { title: "お題読込中", min: "小", max: "大" };
        const randomLine = this.allThemes[Math.floor(Math.random() * this.allThemes.length)];
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

    // ==========================================
    // 入室処理 (isRejoin: 自動再接続かどうか)
    // ==========================================
    async joinRoom(isRejoin = false) {
        const name = this.usernameInput.value.trim();
        const room = this.roomInput.value.trim();
        if (!name || !room) { alert("入力してください"); return; }

        const roomRef = ref(db, `rooms/${room}`);
        const snapshot = await get(roomRef);
        let roomData = snapshot.val();

        // 自動リセット（廃墟掃除）
        if (roomData && (!roomData.members || Object.keys(roomData.members).length === 0)) {
            // 再接続時以外で、メンバー0人なら掃除
            console.log("古いデータが残っていたため、自動リセットしました");
            await remove(roomRef);
            roomData = null;
        }

        // 名前重複チェック（再接続時はスキップ）
        if (!isRejoin && roomData && roomData.members) {
            const isNameTaken = Object.values(roomData.members).some(m => m.name === name);
            if (isNameTaken) { 
                alert("その名前は既に使用されています。別の名前にしてください。"); 
                // セッション情報も消しておく
                sessionStorage.removeItem('ito_room');
                sessionStorage.removeItem('ito_name');
                return; 
            }
        }

        // ホスト判定
        if (!roomData || !roomData.host) {
            this.isHost = true;
            const initialTheme = this.getRandomTheme();
            await set(roomRef, { host: name, theme: initialTheme, status: 'playing' });
        } else if (roomData.host === name) {
            this.isHost = true;
        } else {
            this.isHost = false;
        }

        this.myName = name;
        this.currentRoomId = room;

        // ★セッションに保存
        sessionStorage.setItem('ito_room', room);
        sessionStorage.setItem('ito_name', name);

        // メンバー登録（切断時はリストから消えるが、カードは消さない）
        const membersRef = ref(db, `rooms/${this.currentRoomId}/members`);
        this.myMemberRef = push(membersRef, { name: this.myName, joinedAt: Date.now() });
        onDisconnect(this.myMemberRef).remove();
        
        if (this.isHost) this.hostControls.classList.remove('hidden');
        else this.hostControls.classList.add('hidden');

        // ★カードの復元または新規ドロー
        this.restoreOrDrawCard(roomData);

        this.lobbyScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');

        this.startListeningToRoom();
        this.startListeningToHistory();
    }

    // ★重要: カード復元ロジック
    restoreOrDrawCard(roomData) {
        this.myCardRef = null;
        this.myNumber = null;
        let foundCard = null;

        // 既に提出済みのカードの中に自分の名前があるか探す
        if (roomData && roomData.cards) {
            const cards = roomData.cards;
            const cardKey = Object.keys(cards).find(key => cards[key].name === this.myName);
            if (cardKey) {
                foundCard = cards[cardKey];
                this.myCardRef = ref(db, `rooms/${this.currentRoomId}/cards/${cardKey}`);
            }
        }

        if (foundCard) {
            // カードが見つかった（復帰）
            this.myNumber = foundCard.value;
            this.myCardElement.textContent = "済";
            this.myCardElement.classList.add('submitted');
            this.playBtn.textContent = "提出済み";
            this.playBtn.disabled = true;
            
            // クリックで見えるようにするイベント再登録
            this.myCardElement.onclick = () => {
                this.myCardElement.textContent = (this.myCardElement.textContent === "済") ? this.myNumber : "済";
            };
        } else {
            // 新規ドロー（まだ出していない、または新規参加）
            this.drawNewCard();
        }
        
        this.resultOverlay.classList.add('hidden');
    }

    drawNewCard() {
        this.myNumber = Math.floor(Math.random() * 100) + 1;
        this.myCardElement.textContent = this.myNumber;
        this.myCardElement.classList.remove('submitted');
        this.playBtn.textContent = "カードを出す";
        this.playBtn.disabled = false;
        this.myCardRef = null;
        // onclickイベントを解除（または上書き）
        this.myCardElement.onclick = null;
    }

    playCard() {
        if (this.playBtn.disabled) return;
        
        // ★修正: onDisconnect().remove() を削除しました！
        // これにより、リロードしてもカードが消えず、バグが解消されます。
        this.myCardRef = push(ref(db, `rooms/${this.currentRoomId}/cards`), { name: this.myName, value: this.myNumber });
        
        this.myCardElement.classList.add('submitted');
        this.myCardElement.textContent = "済";
        this.playBtn.textContent = "提出済み";
        this.playBtn.disabled = true;
        this.myCardElement.onclick = () => {
            this.myCardElement.textContent = (this.myCardElement.textContent === "済") ? this.myNumber : "済";
        };
    }

    // ★追加: 退出処理
    exitGame() {
        this.showConfirm("退出しますか？\n（あなたのカードも消えます）", async () => {
            // 1. 自分のカードがあれば消す
            if (this.myCardRef) {
                await remove(this.myCardRef);
            }
            // 2. メンバーリストから消す
            if (this.myMemberRef) {
                await remove(this.myMemberRef);
            }
            // 3. セッション削除
            sessionStorage.removeItem('ito_room');
            sessionStorage.removeItem('ito_name');
            
            // 4. リロードしてロビーへ
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
        this.showConfirm("次のゲームに進みますか？", () => {
            const newTheme = this.getRandomTheme();
            update(ref(db, `rooms/${this.currentRoomId}`), {
                theme: newTheme,
                status: 'playing',
                cards: null,
                order: null
            });
        });
    }

    resetGame() {
        this.showConfirm("全データを削除しますか？\n(全員強制退出になります)", () => {
            remove(ref(db, `rooms/${this.currentRoomId}`));
        });
    }

    calculateResult(roomData) {
        if (!roomData || !roomData.cards) return { isSuccess: true, resultText: "カードなし" };
        const cardsObj = roomData.cards;
        const orderList = roomData.order || [];
        let cardsArray = Object.keys(cardsObj).map(key => ({ id: key, ...cardsObj[key] }));
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
        return { isSuccess, resultText: resultTextArray.join(" → ") };
    }

    startListeningToRoom() {
        const roomRef = ref(db, `rooms/${this.currentRoomId}`);
        onValue(roomRef, (snapshot) => {
            const roomData = snapshot.val();
            if (!roomData) {
                // セッション情報も消してリロード
                sessionStorage.removeItem('ito_room');
                sessionStorage.removeItem('ito_name');
                alert("リセットされました");
                location.reload();
                return;
            }

            if (roomData.theme) {
                this.themeText.textContent = roomData.theme.title;
                this.currentThemeTitle = roomData.theme.title;
                this.rangeMin.textContent = roomData.theme.min;
                this.rangeMax.textContent = roomData.theme.max;
            }

            // 次のゲームに進んだときの処理
            if (!roomData.cards && roomData.status === 'playing') {
                this.fieldArea.innerHTML = "";
                // 自分が提出済み状態なら、新しいカードを引く状態に戻す
                if (this.playBtn.disabled) this.drawNewCard();
            }

            this.renderField(roomData);
            if (roomData.members) {
                this.renderMemberList(roomData.members, roomData.cards);
            } else {
                this.memberCount.textContent = "参加者: 0人";
                this.memberList.innerHTML = "";
            }

            if (roomData.status === 'revealed') {
                const result = this.calculateResult(roomData);
                this.showGameResult(result);
            } else {
                if (!this.resultOverlay.classList.contains('hidden') && !roomData.cards) {
                    this.resultOverlay.classList.add('hidden');
                }
            }

            if (this.isHost) {
                const membersCount = roomData.members ? Object.keys(roomData.members).length : 0;
                const cardsCount = roomData.cards ? Object.keys(roomData.cards).length : 0;
                
                if (roomData.status === 'playing') {
                    if (membersCount > 0 && membersCount === cardsCount) {
                        this.revealBtn.disabled = false;
                        this.revealBtn.textContent = "OPEN";
                    } else {
                        this.revealBtn.disabled = true;
                        this.revealBtn.textContent = `OPEN (${cardsCount}/${membersCount})`;
                    }
                } else {
                    this.revealBtn.disabled = true;
                    this.revealBtn.textContent = "OPEN済";
                }
            }
        });
    }

    renderField(roomData) {
        if (!roomData.cards) {
            this.fieldArea.innerHTML = "";
            return;
        }
        const cardsObj = roomData.cards;
        const orderList = roomData.order || [];
        const isRevealed = (roomData.status === 'revealed');
        let cardsArray = Object.keys(cardsObj).map(key => ({ id: key, ...cardsObj[key] }));
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

    renderMemberList(membersObj, cardsObj) {
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
            const statusMark = isSubmitted ? '✔' : '...';
            item.innerHTML = `<div class="avatar-xs" style="background-color: ${color}">${initial}</div>${member.name}<span class="status-mark" style="color: ${isSubmitted ? 'green' : '#999'}">${statusMark}</span>`;
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
                item.classList.add('history-item');
                const statusClass = entry.isSuccess ? 'success' : 'fail';
                const statusText = entry.isSuccess ? '成功' : '失敗';
                item.innerHTML = `<div class="history-header"><span>${entry.theme}</span><span class="tag ${statusClass}">${statusText}</span></div><div class="history-detail">${entry.resultDetails}</div>`;
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
        this.exitBtn.addEventListener('click', () => this.exitGame()); // ★追加
        
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
            if (e.target == this.resultOverlay) this.resultOverlay.classList.add('hidden');
        });
    }
}

// Initialize the game
const gameManager = new GameManager();