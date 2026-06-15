// ================= SUPABASE CONFIG =================
let localUrl = "";
let localKey = "";
try {
    localUrl = localStorage.getItem("supabase_url") || "";
    localKey = localStorage.getItem("supabase_anon_key") || "";
} catch (e) {}

let SUPABASE_URL = window.SUPABASE_URL || localUrl || "";
let SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || localKey || "";

let supabaseClient = null;

function initSupabase() {
    const isSupabaseConfigured = 
        SUPABASE_URL && 
        SUPABASE_URL !== "" && 
        !SUPABASE_URL.includes("your-supabase-project") && 
        SUPABASE_ANON_KEY && 
        !SUPABASE_ANON_KEY.includes("someSignature");

    if (isSupabaseConfigured && typeof supabase !== 'undefined' && supabase.createClient) {
        try {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log("Supabase client initialized successfully.");
        } catch (e) {
            console.error("Error creating Supabase client:", e);
            supabaseClient = null;
        }
    } else {
        supabaseClient = null;
        console.log("Supabase not configured or library missing. Using offline mode.");
    }
}
initSupabase();

let currentUsername = "";
let totalPlayTime = 0;
let totalWins = 0;
let sessionPlayTime = 0;

// Safe storage wrapper to prevent crashes on mobile / local file:// protocols
const safeStorage = {
    getItem: function(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return this._data[key] || null;
        }
    },
    setItem: function(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            this._data[key] = String(value);
        }
    },
    removeItem: function(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            delete this._data[key];
        }
    },
    _data: {}
};

// ================= CANVAS =================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// ================= IMAGES =================
// Player images (2 options) - Track isSpriteSheet metadata
const playerImgs = [
    { src: "resources/player_sheet.png", isSpriteSheet: true },
    { src: "resources/player4.png", isSpriteSheet: false }
].map(item => {
    const img = new Image();
    img.src = item.src;
    return { img, isSpriteSheet: item.isSpriteSheet };
});

// Opponent images (2 options)
const opponentImgs = [
    { src: "resources/player_Opponent.png", isSpriteSheet: false },
    { src: "resources/player3.png", isSpriteSheet: false }
].map(item => {
    const img = new Image();
    img.src = item.src;
    return { img, isSpriteSheet: item.isSpriteSheet };
});

const ballImg = new Image();
ballImg.src = "resources/ball.png";
const bgImg = new Image();
bgImg.src = "resources/ground.jpg";

// ================= SOUNDS =================
const kickSound = new Audio("resources/kick.mp3");
const goalSound = new Audio("resources/goal.mp3");
const selectSound = new Audio("resources/select.mp3");
const crowdCheerSound = new Audio("resources/west-ham-bubbles-77370.mp3");
crowdCheerSound.loop = true;
crowdCheerSound.volume = 0.4;

const audioTracks = {
    launch: "resources/launch_music.mp3",
    menu: "resources/menu_music.mp3",
    match: "resources/football-412586.mp3"
};

let bgMusic = new Audio(audioTracks.launch);
bgMusic.loop = true;
bgMusic.volume = 0.5;

function playAudio(audio) {
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
    }
}

function setBackgroundTrack(trackPath) {
    if (!bgMusic.src.endsWith(trackPath)) {
        bgMusic.pause();
        bgMusic.src = trackPath;
        bgMusic.loop = true;
    }
    playAudio(bgMusic);
}

// ================= GAME STATE =================
let matchTime = 180; // 3 minutes
let lastMinuteCheck = 180;
const MAX_SPECIAL_SHOTS = 3;
const SHOT_RELOAD_SECS  = 5;
let specialShots = MAX_SPECIAL_SHOTS;
let shotReloadTimer = 0;     // counts UP to SHOT_RELOAD_SECS
let scorePlayer = 0;
let scoreOpponent = 0;
let highScore = Number(safeStorage.getItem("highScore") || 0);
let difficulty = "medium";

// ================= PLAYER/OPPONENT =================
let selectedPlayer = 0; // Default to player_User.png
let selectedOpponent = 0; // Default to player_Opponent.png

const player = { 
    x: 150, 
    y: HEIGHT - 180, 
    w: 120, 
    h: 180, 
    dy: 0, 
    jump: false, 
    speed: 8.0,
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    landTimer: 0,
    animState: "idle",
    animFrame: 0,
    animTimer: 0,
    kickTimer: 0,
    facing: 1
};
const opponent = { 
    x: WIDTH - 300, 
    y: HEIGHT - 180, 
    w: 120, 
    h: 180, 
    dy: 0, 
    jump: false, 
    speed: 6.0, 
    active: false, 
    shooting: false,
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    landTimer: 0,
    animState: "idle",
    animFrame: 0,
    animTimer: 0,
    kickTimer: 0,
    facing: -1
};
const ball = { 
    x: WIDTH / 2, 
    y: HEIGHT - 90, 
    r: 40, 
    dx: 0, 
    dy: 0, 
    lastTouch: "player",
    angle: 0,
    trail: []
};

// Particle System
let particles = [];
function createRunParticle(x, y) {
    particles.push({
        x: x,
        y: y,
        dx: (Math.random() - 0.5) * 1.5,
        dy: -Math.random() * 1.5,
        r: Math.random() * 4 + 2,
        color: Math.random() < 0.6 ? "rgba(100, 200, 100, 0.6)" : "rgba(200, 150, 100, 0.4)", 
        life: 1.0,
        decay: 0.05
    });
}

function createKickSpark(x, y, color = "#ff7a00") {
    const numSparks = 12;
    for (let i = 0; i < numSparks; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 3;
        particles.push({
            x: x,
            y: y,
            dx: Math.cos(angle) * speed,
            dy: Math.sin(angle) * speed,
            r: Math.random() * 3 + 2,
            color: color,
            life: 1.0,
            decay: 0.07
        });
    }
}

// ================= INPUT =================
const keys = {};
let started = false;
let paused = false;
let kickoff = true;
let kickoffSide = "player";
let kickoffCountdown = 3;

// Load saved character selections
if (safeStorage.getItem('selectedPlayer')) {
    selectedPlayer = parseInt(safeStorage.getItem('selectedPlayer'));
}
if (safeStorage.getItem('selectedOpponent')) {
    selectedOpponent = parseInt(safeStorage.getItem('selectedOpponent'));
}

// Load saved volume settings
let musicVolume = safeStorage.getItem('musicVolume') || 50;
let sfxVolume = safeStorage.getItem('sfxVolume') || 70;
bgMusic.volume = musicVolume / 100;
kickSound.volume = sfxVolume / 100;
goalSound.volume = sfxVolume / 100;
selectSound.volume = sfxVolume / 100;
crowdCheerSound.volume = sfxVolume / 100;

// ================= INPUT HANDLING =================
document.addEventListener("keydown", e => {
    const launchScreen = document.getElementById("launchPage");
    const gameScreen = document.getElementById("gameContainer");

    if (e.code === "Enter" && launchScreen && launchScreen.style.display !== "none") {
        e.preventDefault();
        document.getElementById("enterBtn").click();
        return;
    }

    keys[e.code] = true;

    if (gameScreen && gameScreen.style.display === "none") return;

    // Always stop Space from scrolling the page while playing
    if (e.code === "Space") e.preventDefault();

    if (e.code === "Enter" && !paused) {
        if (!started) started = true;
        else restartMatch();
    }
    if (e.code === "Escape") {
        togglePause();
    }

    if (started && !kickoff && !paused) {
        if (e.code === "KeyD") {
            shootBall(player, 10.0, -8.0);
            player.kickTimer = 16;
            player.animFrame = 0;
        }
        if (e.code === "Space" || e.code === "KeyQ") {
            if (specialShots > 0) {
                specialShoot(player);
                player.kickTimer = 16;
                player.animFrame = 0;
            } else {
                // Flash "no shots" feedback
                showNoShotsFlash();
            }
        }
    }
});

document.addEventListener("keyup", e => keys[e.code] = false);

// ================= UI ELEMENTS =================
const launchPage = document.getElementById('launchPage');
const homeMenu = document.getElementById('homeMenu');
const gameContainer = document.getElementById('gameContainer');
const settingsPanel = document.getElementById('settingsPanel');
const highScoresPanel = document.getElementById('highScoresPanel');
const characterPanel = document.getElementById('characterPanel');
const matchOverPanel = document.getElementById('matchOverPanel');
const pausePanel = document.getElementById('pausePanel');
const authPage = document.getElementById('authPage');
const authOptions = document.getElementById('authOptions');
const startNewForm = document.getElementById('startNewForm');
const continueForm = document.getElementById('continueForm');

const playerScoreDisplay = document.getElementById('playerScore');
const opponentScoreDisplay = document.getElementById('opponentScore');
const matchTimeDisplay = document.getElementById('matchTime');
const specialShotsDisplay    = document.getElementById('specialShots');
const specialShotsMiniDisplay = document.getElementById('specialShotsMini');
const highScoreDisplay        = document.getElementById('highScoreDisplay');

// ================= INITIALIZE =================
function init() {
    playAudio(bgMusic);
    gameLoop();
    
    // Load saved volume settings to UI
    document.getElementById('musicVolume').value = musicVolume;
    document.getElementById('sfxVolume').value = sfxVolume;
}

// ================= MENU FUNCTIONS =================
function sanitizeUsername(username) {
    let clean = username.trim();
    if (!clean.startsWith('@')) {
        clean = '@' + clean;
    }
    return clean;
}

// Register Player against Supabase
async function registerPlayer(username, password) {
    const errorDiv = document.getElementById('newPlayerError');
    errorDiv.textContent = "";
    
    const submitBtn = document.getElementById('btnSubmitNewPlayer');
    const originalText = submitBtn ? submitBtn.innerHTML : "Create Player";
    
    const cleanUsername = sanitizeUsername(username);
    if (cleanUsername.length < 3) {
        errorDiv.textContent = "Username must be at least 3 characters.";
        return;
    }
    if (password.length < 4) {
        errorDiv.textContent = "Password must be at least 4 characters.";
        return;
    }
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    }
    
    const restoreBtn = () => {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    };
    
    if (!supabaseClient) {
        errorDiv.textContent = "Supabase offline. Creating local session...";
        setTimeout(() => {
            safeStorage.setItem('own_goal_username', cleanUsername);
            safeStorage.setItem('own_goal_password', password);
            safeStorage.setItem('highScore', 0);
            safeStorage.setItem('wins', 0);
            safeStorage.setItem('playTime', 0);
            highScore = 0;
            totalWins = 0;
            totalPlayTime = 0;
            restoreBtn();
            enterMainMenu(cleanUsername, 0, 0, 0);
        }, 1000);
        return;
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('leaderboard')
            .select('username')
            .eq('username', cleanUsername)
            .maybeSingle();
            
        if (error) throw error;
        
        if (data) {
            errorDiv.textContent = "Username already taken! Try Continue Existing.";
            restoreBtn();
            return;
        }
        
        const { error: insertError } = await supabaseClient
            .from('leaderboard')
            .insert([{ username: cleanUsername, password: password, high_score: 0, wins: 0, play_time: 0 }]);
            
        if (insertError) throw insertError;
        
        safeStorage.setItem('own_goal_username', cleanUsername);
        safeStorage.setItem('own_goal_password', password);
        safeStorage.setItem('highScore', 0);
        safeStorage.setItem('wins', 0);
        safeStorage.setItem('playTime', 0);
        
        highScore = 0;
        totalWins = 0;
        totalPlayTime = 0;
        
        restoreBtn();
        enterMainMenu(cleanUsername, 0, 0, 0);
    } catch (err) {
        console.error(err);
        errorDiv.textContent = "Failed to create player: " + err.message;
        restoreBtn();
    }
}

// Login Player against Supabase
async function loginPlayer(username, password, isAutoLogin = false) {
    const errorDiv = isAutoLogin ? null : document.getElementById('existPlayerError');
    if (errorDiv) errorDiv.textContent = "";
    
    const submitBtn = isAutoLogin ? null : document.getElementById('btnSubmitExistPlayer');
    const originalText = submitBtn ? submitBtn.innerHTML : "Log In";
    
    const cleanUsername = sanitizeUsername(username);
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging In...';
    }
    
    const restoreBtn = () => {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    };
    
    if (!supabaseClient) {
        const savedUser = safeStorage.getItem('own_goal_username');
        const savedPass = safeStorage.getItem('own_goal_password');
        if (savedUser === cleanUsername && savedPass === password) {
            const savedScore = parseInt(safeStorage.getItem('highScore') || 0);
            const savedWins = parseInt(safeStorage.getItem('wins') || 0);
            const savedPlayTime = parseInt(safeStorage.getItem('playTime') || 0);
            highScore = savedScore;
            totalWins = savedWins;
            totalPlayTime = savedPlayTime;
            restoreBtn();
            enterMainMenu(cleanUsername, savedScore, savedWins, savedPlayTime);
        } else if (isAutoLogin) {
            restoreBtn();
            authPage.style.display = 'flex';
        } else {
            errorDiv.textContent = "Credentials do not match local offline session.";
            restoreBtn();
        }
        return;
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('leaderboard')
            .select('username, password, high_score, wins, play_time')
            .eq('username', cleanUsername)
            .maybeSingle();
            
        if (error) throw error;
        
        if (!data || data.password !== password) {
            if (isAutoLogin) {
                safeStorage.removeItem('own_goal_username');
                safeStorage.removeItem('own_goal_password');
                authPage.style.display = 'flex';
            } else {
                errorDiv.textContent = "Invalid username or password.";
            }
            restoreBtn();
            return;
        }
        
        const dbWins = data.wins || 0;
        const dbPlayTime = data.play_time || 0;
        
        safeStorage.setItem('own_goal_username', cleanUsername);
        safeStorage.setItem('own_goal_password', password);
        safeStorage.setItem('highScore', data.high_score);
        safeStorage.setItem('wins', dbWins);
        safeStorage.setItem('playTime', dbPlayTime);
        
        highScore = data.high_score;
        totalWins = dbWins;
        totalPlayTime = dbPlayTime;
        
        restoreBtn();
        enterMainMenu(cleanUsername, data.high_score, dbWins, dbPlayTime);
    } catch (err) {
        console.error(err);
        if (isAutoLogin) {
            authPage.style.display = 'flex';
        } else {
            errorDiv.textContent = "Login failed: " + err.message;
        }
        restoreBtn();
    }
}

// Helper to format playtime seconds to MM:SS or HH:MM:SS
function formatTotalPlayTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Transition to Main Menu
function enterMainMenu(username, score, wins = 0, playTime = 0) {
    currentUsername = username;
    highScore = score;
    totalWins = wins;
    totalPlayTime = playTime;
    
    document.getElementById('loggedInUsername').textContent = username;
    document.getElementById('hudPlayerName').textContent = username.toUpperCase();
    highScoreDisplay.textContent = score;
    
    // Update main menu stats boxes
    const statsBoxes = document.querySelectorAll('.menu-stats .stat-box');
    if (statsBoxes.length >= 3) {
        statsBoxes[0].querySelector('.stat-value').textContent = formatTotalPlayTime(playTime);
        statsBoxes[1].querySelector('.stat-value').textContent = score;
        statsBoxes[2].querySelector('.stat-value').textContent = wins;
    }
    
    authPage.style.display = 'none';
    homeMenu.style.display = 'flex';
    setBackgroundTrack(audioTracks.menu);
}

// Option select event listeners
document.getElementById('btnStartNewOpt').addEventListener('click', () => {
    selectSound.play();
    authOptions.style.display = 'none';
    startNewForm.style.display = 'flex';
});

document.getElementById('btnContinueOpt').addEventListener('click', () => {
    selectSound.play();
    authOptions.style.display = 'none';
    continueForm.style.display = 'flex';
});

document.getElementById('btnBackToLaunch').addEventListener('click', () => {
    selectSound.play();
    authPage.style.display = 'none';
    launchPage.style.display = 'flex';
    launchPage.style.opacity = 1;
});

document.querySelectorAll('.btnBackToOptions').forEach(btn => {
    btn.addEventListener('click', () => {
        selectSound.play();
        startNewForm.style.display = 'none';
        continueForm.style.display = 'none';
        authOptions.style.display = 'flex';
    });
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    selectSound.play();
    safeStorage.removeItem('own_goal_username');
    safeStorage.removeItem('own_goal_password');
    currentUsername = "";
    
    homeMenu.style.display = 'none';
    startNewForm.style.display = 'none';
    continueForm.style.display = 'none';
    authOptions.style.display = 'flex';
    authPage.style.display = 'flex';
    setBackgroundTrack(audioTracks.launch);
});

document.getElementById('startNewForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('newUsername').value;
    const pass = document.getElementById('newPassword').value;
    registerPlayer(user, pass);
});

document.getElementById('continueForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('existUsername').value;
    const pass = document.getElementById('existPassword').value;
    loginPlayer(user, pass);
});

document.getElementById('enterBtn').addEventListener('click', () => {
    selectSound.play();
    
    // Automatically request fullscreen on user interaction
    try {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        }
    } catch (err) {
        console.warn("Fullscreen request failed:", err);
    }
    
    launchPage.style.opacity = 0;
    setTimeout(() => {
        launchPage.style.display = 'none';
        
        const savedUsername = safeStorage.getItem('own_goal_username');
        const savedPassword = safeStorage.getItem('own_goal_password');
        if (savedUsername && savedPassword) {
            loginPlayer(savedUsername, savedPassword, true);
        } else {
            authPage.style.display = 'flex';
        }
    }, 500);
});

// Fullscreen Toggle in settings
const btnToggleFullscreen = document.getElementById('btnToggleFullscreen');
if (btnToggleFullscreen) {
    btnToggleFullscreen.addEventListener('click', () => {
        selectSound.play();
        try {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                if (document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen();
                } else if (document.documentElement.webkitRequestFullscreen) {
                    document.documentElement.webkitRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
        } catch (err) {
            console.error("Fullscreen toggle failed:", err);
        }
    });
}

// Update fullscreen button text dynamically
const onFullscreenChange = () => {
    const btn = document.getElementById('btnToggleFullscreen');
    if (btn) {
        const isFS = document.fullscreenElement || document.webkitFullscreenElement;
        if (isFS) {
            btn.innerHTML = '<i class="fas fa-compress"></i> Exit Fullscreen';
        } else {
            btn.innerHTML = '<i class="fas fa-expand"></i> Enter Fullscreen';
        }
    }
};
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

document.getElementById('startGameBtn').addEventListener('click', () => {
    selectSound.play();
    homeMenu.style.display = 'none';
    gameContainer.style.display = 'block';
    if (document.activeElement) document.activeElement.blur();
    setBackgroundTrack(audioTracks.match);
    restartMatch(true);
    playAudio(crowdCheerSound);
});

// ================= CHARACTER SELECTION =================
document.getElementById('characterBtn').addEventListener('click', () => {
    selectSound.play();
    characterPanel.style.display = 'block';
    updateCharacterSelectionUI();
});

document.getElementById('closeCharacter').addEventListener('click', () => {
    selectSound.play();
    characterPanel.style.display = 'none';
});

document.getElementById('saveCharacters').addEventListener('click', () => {
    selectSound.play();
    characterPanel.style.display = 'none';
    safeStorage.setItem('selectedPlayer', selectedPlayer);
    safeStorage.setItem('selectedOpponent', selectedOpponent);
});

function updateCharacterSelectionUI() {
    // Update player selection
    document.querySelectorAll('.character-card[data-player]').forEach(card => {
        card.classList.remove('selected');
        if (parseInt(card.dataset.player) === selectedPlayer) {
            card.classList.add('selected');
        }
    });
    
    // Update opponent selection
    document.querySelectorAll('.character-card[data-opponent]').forEach(card => {
        card.classList.remove('selected');
        if (parseInt(card.dataset.opponent) === selectedOpponent) {
            card.classList.add('selected');
        }
    });
}

// Character selection event listeners
document.querySelectorAll('.character-card[data-player]').forEach(card => {
    card.addEventListener('click', () => {
        selectSound.play();
        selectedPlayer = parseInt(card.dataset.player);
        updateCharacterSelectionUI();
    });
});

document.querySelectorAll('.character-card[data-opponent]').forEach(card => {
    card.addEventListener('click', () => {
        selectSound.play();
        selectedOpponent = parseInt(card.dataset.opponent);
        updateCharacterSelectionUI();
    });
});

// ================= SETTINGS PANEL =================
document.getElementById('settingsBtn').addEventListener('click', () => {
    selectSound.play();
    document.getElementById('dbUrlInput').value = localStorage.getItem('supabase_url') || SUPABASE_URL || '';
    document.getElementById('dbKeyInput').value = localStorage.getItem('supabase_anon_key') || SUPABASE_ANON_KEY || '';
    settingsPanel.style.display = 'block';
});

document.getElementById('closeSettings').addEventListener('click', () => {
    selectSound.play();
    settingsPanel.style.display = 'none';
});

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    selectSound.play();
    
    // Save music selection
    const musicSelect = document.getElementById('musicSelect');
    const selectedMusic = musicSelect.options[musicSelect.selectedIndex].value;
    
    // Save volume settings
    musicVolume = document.getElementById('musicVolume').value;
    sfxVolume = document.getElementById('sfxVolume').value;
    
    // Apply volume settings
    bgMusic.volume = musicVolume / 100;
    kickSound.volume = sfxVolume / 100;
    goalSound.volume = sfxVolume / 100;
    selectSound.volume = sfxVolume / 100;
    crowdCheerSound.volume = sfxVolume / 100;
    
    // Save to safeStorage
    safeStorage.setItem('musicVolume', musicVolume);
    safeStorage.setItem('sfxVolume', sfxVolume);
    
    // Save database credentials
    const dbUrl = document.getElementById('dbUrlInput').value.trim();
    const dbKey = document.getElementById('dbKeyInput').value.trim();
    
    try {
        localStorage.setItem('supabase_url', dbUrl);
        localStorage.setItem('supabase_anon_key', dbKey);
    } catch (e) {}
    
    SUPABASE_URL = dbUrl;
    SUPABASE_ANON_KEY = dbKey;
    initSupabase();
    
    // Change music if needed
    if (bgMusic.src.indexOf(selectedMusic) === -1) {
        const wasPlaying = !bgMusic.paused;
        bgMusic.pause();
        bgMusic.src = "resources/" + selectedMusic;
        bgMusic.loop = true;
        if (wasPlaying) {
            playAudio(bgMusic);
        }
    }
    
    settingsPanel.style.display = 'none';
});

// ================= HIGH SCORES =================
document.getElementById('scoresBtn').addEventListener('click', () => {
    selectSound.play();
    updateHighScoresList();
    highScoresPanel.style.display = 'block';
});

document.getElementById('closeScores').addEventListener('click', () => {
    selectSound.play();
    highScoresPanel.style.display = 'none';
});

document.getElementById('closeScoresBtn').addEventListener('click', () => {
    selectSound.play();
    highScoresPanel.style.display = 'none';
});

// ================= CREDITS =================
document.getElementById('creditsBtn').addEventListener('click', () => {
    selectSound.play();
    alert("OWN GOAL $OG Arcade\n\nLore:\nOther players run forward. Our legend runs sideways, trips over the referee, and boots the ball backwards.\n\nThe worse he plays, the higher we go! 100% of creator fees are routed to buyback and burn $OG tokens!");
});

// ================= LAUNCH PAGE FEATURE BUTTONS =================
document.getElementById('featureLeaderboard').addEventListener('click', () => {
    updateHighScoresList();
    highScoresPanel.style.display = 'block';
});

document.getElementById('featureSettings').addEventListener('click', () => {
    document.getElementById('dbUrlInput').value = localStorage.getItem('supabase_url') || SUPABASE_URL || '';
    document.getElementById('dbKeyInput').value = localStorage.getItem('supabase_anon_key') || SUPABASE_ANON_KEY || '';
    settingsPanel.style.display = 'block';
});

document.getElementById('featureControls').addEventListener('click', () => {
    document.getElementById('controlsPanel').style.display = 'block';
});

document.getElementById('closeControlsPanel').addEventListener('click', () => {
    document.getElementById('controlsPanel').style.display = 'none';
});

// ================= PAUSE FUNCTIONALITY =================
function togglePause() {
    if (!started) return;
    
    paused = !paused;
    
    if (paused) {
        crowdCheerSound.pause();
        bgMusic.pause();
        pausePanel.style.display = 'flex';
    } else {
        if (!kickoff) playAudio(crowdCheerSound);
        playAudio(bgMusic);
        pausePanel.style.display = 'none';
    }
}

const hudPauseBtn = document.getElementById("hudPauseBtn");
if (hudPauseBtn) {
    hudPauseBtn.addEventListener("click", () => {
        selectSound.play();
        togglePause();
    });
}

document.getElementById('resumeBtn').addEventListener('click', () => {
    selectSound.play();
    togglePause();
});

document.getElementById('restartBtn').addEventListener('click', () => {
    selectSound.play();
    pausePanel.style.display = 'none';
    restartMatch();
});

document.getElementById('pauseMainMenuBtn').addEventListener('click', () => {
    selectSound.play();
    saveMatchStats();
    pausePanel.style.display = 'none';
    gameContainer.style.display = 'none';
    homeMenu.style.display = 'flex';
    setBackgroundTrack(audioTracks.menu);
    restartMatch(false);
});

// ================= GAME FUNCTIONS =================
function shootBall(p, dxPower, dyPower) {
    if (collision(p) || ball.lastTouch === "player") {
        kickSound.play();
        const hitPos = (ball.y - p.y) / p.h;
        ball.dx = dxPower;
        ball.dy = dyPower + hitPos * 4;
        ball.lastTouch = "player";
        opponent.active = true;
        createKickSpark(ball.x, ball.y, "#ff7a00");
    }
}

function specialShoot(p) {
    if (specialShots <= 0) return;

    kickSound.play();
    const goalX = WIDTH - 20;
    const goalY = HEIGHT - 260 / 2;
    ball.dx = (goalX - ball.x) / 18;
    ball.dy = (goalY - ball.y) / 18;
    ball.lastTouch = "player";
    opponent.active = false;
    specialShots--;
    // Reset reload timer so this shot takes 5 s to reload
    if (specialShots < MAX_SPECIAL_SHOTS) shotReloadTimer = 0;

    createKickSpark(ball.x, ball.y, "#ffa64d");
    createKickSpark(ball.x, ball.y, "#ff7a00");
    // Visual flash on shot count
    [specialShotsDisplay, specialShotsMiniDisplay].forEach(el => {
        if (!el) return;
        el.style.color = '#ff7a00';
        setTimeout(() => { el.style.color = ''; }, 300);
    });
}

function showNoShotsFlash() {
    [specialShotsDisplay, specialShotsMiniDisplay].forEach(el => {
        if (!el) return;
        el.style.color = '#cc0000';
        el.style.transform = 'scale(1.4)';
        setTimeout(() => { el.style.color = ''; el.style.transform = ''; }, 350);
    });
}

// ================= GAME LOOP =================
function gameLoop() {
    if (paused) {
        requestAnimationFrame(gameLoop);
        return;
    }

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawField();

    if (!started) {
        drawText("PRESS ENTER TO START", WIDTH / 2, HEIGHT / 2, 36);
        requestAnimationFrame(gameLoop);
        return;
    }
    
    if (matchTime <= 0) {
        endMatch();
        requestAnimationFrame(gameLoop);
        return;
    }

    updateTimer();
    
    if (kickoff) {
        drawText("Kickoff in " + Math.ceil(kickoffCountdown), WIDTH / 2, HEIGHT / 2, 32);
        kickoffCountdown -= 1 / 60;
        if (kickoffCountdown <= 0) kickoff = false;
    }

    updatePlayer();
    updateOpponent();
    updateBall();
    
    // Update and Draw Particles
    particles = particles.filter(p => {
        p.x += p.dx;
        p.y += p.dy;
        p.life -= p.decay;
        
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        return p.life > 0;
    });
    ctx.globalAlpha = 1.0; // Reset alpha
    
    // Draw characters with selected images
    drawPlayer(player, playerImgs[selectedPlayer]);
    drawPlayer(opponent, opponentImgs[selectedOpponent]);
    
    drawBall();
    updateHUD();

    requestAnimationFrame(gameLoop);
}

// ================= ANIMATION HELPER =================
function updateAnimation(p, isMovingLeft, isMovingRight) {
    if (p.kickTimer > 0) {
        p.animState = "kick";
        p.kickTimer--;
        p.animFrame = Math.floor((16 - p.kickTimer) / 4) % 4;
    } else if (p.jump) {
        p.animState = "jump";
        p.animFrame = 2; // Jump frame
    } else if (isMovingLeft || isMovingRight) {
        p.animState = "walk";
        p.animTimer++;
        if (p.animTimer >= 6) {
            p.animTimer = 0;
            p.animFrame = (p.animFrame + 1) % 6;
        }
    } else {
        p.animState = "idle";
        p.animFrame = 0;
        p.animTimer = 0;
    }
}

// ================= PLAYER/OPPONENT UPDATE =================
function updatePlayer() {
    if (kickoff) return;
    
    const isMovingLeft = keys.ArrowLeft;
    const isMovingRight = keys.ArrowRight;
    
    if (isMovingLeft) {
        player.x -= player.speed;
        player.facing = -1;
        if (!player.jump) {
            player.angle = Math.sin(Date.now() / 80) * 0.08;
            if (Math.random() < 0.35) createRunParticle(player.x + player.w / 2, HEIGHT - 2);
        }
    } else if (isMovingRight) {
        player.x += player.speed;
        player.facing = 1;
        if (!player.jump) {
            player.angle = Math.sin(Date.now() / 80) * 0.08;
            if (Math.random() < 0.35) createRunParticle(player.x + player.w / 2, HEIGHT - 2);
        }
    } else {
        player.angle = 0;
    }

    if (keys.ArrowUp && !player.jump) {
        player.dy = -18.5;
        player.jump = true;
    }

    player.dy += 0.75;
    player.y += player.dy;
    
    if (player.y + player.h >= HEIGHT) {
        if (player.jump) {
            player.scaleX = 1.25;
            player.scaleY = 0.75;
            player.landTimer = 8;
            for (let i = 0; i < 5; i++) {
                createRunParticle(player.x + player.w / 2, HEIGHT - 2);
            }
        }
        player.y = HEIGHT - player.h;
        player.dy = 0;
        player.jump = false;
    }
    
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > WIDTH) player.x = WIDTH - player.w;

    if (collision(player)) {
        kickSound.play();
        const hitPos = (ball.y - player.y) / player.h;
        ball.dx = 11.5;
        ball.dy = -10 + hitPos * 10;
        ball.lastTouch = "player";
        opponent.active = false;
        createKickSpark(ball.x, ball.y, "#ff7a00");
        
        player.kickTimer = 16;
        player.animFrame = 0;
        
        // Power boost on aerial header – does NOT consume special shots
        if (player.jump && hitPos < 0.4) {
            ball.dy = -22;
            ball.dx = 14;
        }
    }
    
    updateAnimation(player, isMovingLeft, isMovingRight);
}

function updateOpponent() {
    if (kickoff) return;
    
    const homeX = WIDTH - 300;
    const speedFactor = difficulty === "easy" ? 0.35 : difficulty === "medium" ? 0.70 : 0.85;

    let isMovingLeft = false;
    let isMovingRight = false;

    if (!opponent.active) {
        opponent.x += (homeX - opponent.x) * 0.02;
        if (ball.lastTouch === "player" && ball.x > WIDTH / 2) opponent.active = true;
        opponent.angle = 0;
    }

    if (opponent.active) {
        if (ball.x < opponent.x + opponent.w / 2) {
            opponent.x -= opponent.speed * speedFactor;
            isMovingLeft = true;
        } else if (ball.x > opponent.x + opponent.w / 2) {
            opponent.x += opponent.speed * speedFactor;
            isMovingRight = true;
        }

        const isMoving = isMovingLeft || isMovingRight;
        if (isMoving && !opponent.jump) {
            opponent.angle = Math.sin(Date.now() / 80) * 0.08;
            if (Math.random() < 0.35) createRunParticle(opponent.x + opponent.w / 2, HEIGHT - 2);
        } else if (!opponent.jump) {
            opponent.angle = 0;
        }

        if (!opponent.jump && ball.y < HEIGHT - 80 && ball.x > opponent.x - 70 && ball.x < opponent.x + opponent.w + 70) {
            if (Math.random() < 0.55) {
                opponent.dy = -17.5 - Math.random() * 2;
                opponent.jump = true;
            }
        }

        const nearGoal = ball.x < WIDTH / 2 && ball.lastTouch !== "opponent";
        const missedBall = ball.x > opponent.x + 70 && ball.lastTouch === "player";

        if (!opponent.shooting && (nearGoal || missedBall) && Math.random() < 0.035) {
            opponent.shooting = true;
            opponent.kickTimer = 16;
            opponent.animFrame = 0;
            setTimeout(() => {
                kickSound.play();
                const hitPos = (ball.y - opponent.y) / opponent.h;
                ball.dx = -11 + Math.random() * 2;
                ball.dy = -8 + hitPos * 8;
                ball.lastTouch = "opponent";
                opponent.shooting = false;
                createKickSpark(ball.x, ball.y, "#ffa64d");
            }, 200);
        }

        opponent.x += Math.sin(Date.now() / 200) * 0.2;
    }

    // Facing logic for opponent goalie
    if (isMovingLeft) {
        opponent.facing = -1;
    } else if (isMovingRight) {
        opponent.facing = 1;
    } else {
        // Face the center of the field by default when idle
        opponent.facing = opponent.x > WIDTH / 2 ? -1 : 1;
    }

    opponent.dy += 0.75;
    opponent.y += opponent.dy;
    
    if (opponent.y + opponent.h >= HEIGHT) {
        if (opponent.jump) {
            opponent.scaleX = 1.25;
            opponent.scaleY = 0.75;
            opponent.landTimer = 8;
            for (let i = 0; i < 5; i++) {
                createRunParticle(opponent.x + opponent.w / 2, HEIGHT - 2);
            }
        }
        opponent.y = HEIGHT - opponent.h;
        opponent.dy = 0;
        opponent.jump = false;
    }
    
    if (opponent.x < 0) opponent.x = 0;
    if (opponent.x + opponent.w > WIDTH) opponent.x = WIDTH - opponent.w;

    if (collision(opponent)) {
        kickSound.play();
        const hitPos = (ball.y - opponent.y) / opponent.h;
        ball.dx = -11 + Math.random() * 2;
        ball.dy = -8 + hitPos * 8;
        ball.lastTouch = "opponent";
        opponent.kickTimer = 16;
        opponent.animFrame = 0;
        createKickSpark(ball.x, ball.y, "#ffa64d");
    }

    updateAnimation(opponent, isMovingLeft, isMovingRight);
}

function updateBall() {
    if (!kickoff) {
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 8) ball.trail.shift();

        ball.x += ball.dx;
        ball.y += ball.dy;
        ball.dy += 0.75; 

        ball.angle += ball.dx * 0.04;

        if (ball.y + ball.r > HEIGHT) {
            ball.y = HEIGHT - ball.r;
            ball.dy *= -0.5; 
            ball.dx *= 0.98; 
            if (Math.abs(ball.dy) > 1.5) {
                createRunParticle(ball.x, HEIGHT - 2);
            }
        }
        
        if (ball.y - ball.r < 0) {
            ball.y = ball.r;
            ball.dy *= -0.5;
        }
        
        // Wall bounces only apply when ball is NOT inside a goal
        const goalTop = HEIGHT - 260;
        const leftPostX = 100;
        const rightPostX = WIDTH - 100;

        if (ball.x - ball.r < 0) {
            if (ball.y <= goalTop) {
                ball.x = ball.r;
                ball.dx *= -0.5;
            }
        }

        if (ball.x + ball.r > WIDTH) {
            if (ball.y <= goalTop) {
                ball.x = WIDTH - ball.r;
                ball.dx *= -0.5;
            }
        }

        // Inside goal: only prevent exit back through the front post (once ball has entered)
        if (ball.y > goalTop) {
            if (ball.x < leftPostX && ball.x + ball.r > leftPostX && ball.dx > 0) {
                ball.dx = -Math.abs(ball.dx) * 0.6;
                ball.x = leftPostX - ball.r;
                kickSound.play();
                createKickSpark(leftPostX, ball.y, "#cccccc");
            }
            if (ball.x > rightPostX && ball.x - ball.r < rightPostX && ball.dx < 0) {
                ball.dx = Math.abs(ball.dx) * 0.6;
                ball.x = rightPostX + ball.r;
                kickSound.play();
                createKickSpark(rightPostX, ball.y, "#cccccc");
            }
        }

        if (ball.x < leftPostX) {
            if (ball.y + ball.r >= goalTop && ball.y < goalTop && ball.dy > 0) {
                ball.dy = -Math.abs(ball.dy) * 0.6;
                ball.y = goalTop - ball.r;
                kickSound.play();
                createKickSpark(ball.x, goalTop, "#cccccc");
            }
        }
        if (ball.x > rightPostX) {
            if (ball.y + ball.r >= goalTop && ball.y < goalTop && ball.dy > 0) {
                ball.dy = -Math.abs(ball.dy) * 0.6;
                ball.y = goalTop - ball.r;
                kickSound.play();
                createKickSpark(ball.x, goalTop, "#cccccc");
            }
        }

        const distL = Math.hypot(ball.x - leftPostX, ball.y - goalTop);
        if (distL < ball.r) {
            const nx = (ball.x - leftPostX) / distL;
            const ny = (ball.y - goalTop) / distL;
            const dot = ball.dx * nx + ball.dy * ny;
            if (dot < 0) {
                ball.dx = (ball.dx - 2 * dot * nx) * 0.6;
                ball.dy = (ball.dy - 2 * dot * ny) * 0.6;
                ball.x = leftPostX + nx * (ball.r + 1);
                ball.y = goalTop + ny * (ball.r + 1);
                kickSound.play();
                createKickSpark(leftPostX, goalTop, "#cccccc");
            }
        }
        const distR = Math.hypot(ball.x - rightPostX, ball.y - goalTop);
        if (distR < ball.r) {
            const nx = (ball.x - rightPostX) / distR;
            const ny = (ball.y - goalTop) / distR;
            const dot = ball.dx * nx + ball.dy * ny;
            if (dot < 0) {
                ball.dx = (ball.dx - 2 * dot * nx) * 0.6;
                ball.dy = (ball.dy - 2 * dot * ny) * 0.6;
                ball.x = rightPostX + nx * (ball.r + 1);
                ball.y = goalTop + ny * (ball.r + 1);
                kickSound.play();
                createKickSpark(rightPostX, goalTop, "#cccccc");
            }
        }

        // Score when ball center crosses the front post (enters the goal)
        if (ball.x < leftPostX && ball.y > goalTop) {
            scoreOpponent++;
            goalSound.play();
            resetKickoff("opponent");
        } else if (ball.x > rightPostX && ball.y > goalTop) {
            scorePlayer++;
            goalSound.play();
            resetKickoff("player");
        }

        if (ball.lastTouch === "player" && ball.x > WIDTH / 2) opponent.active = true;

        ball.dx *= 0.98;
    }
}

function updateTimer() {
    if (kickoff) return;   // timer pauses during kickoff countdown

    matchTime -= 1 / 60;

    if (started && !paused) {
        sessionPlayTime += 1 / 60;
    }

    // Special shot reload: +1 every SHOT_RELOAD_SECS seconds
    if (specialShots < MAX_SPECIAL_SHOTS) {
        shotReloadTimer += 1 / 60;
        if (shotReloadTimer >= SHOT_RELOAD_SECS) {
            specialShots++;
            shotReloadTimer = 0;
            // Flash on reload
            [specialShotsDisplay, specialShotsMiniDisplay].forEach(el => {
                if (!el) return;
                el.style.color = '#00cc44';
                el.style.transform = 'scale(1.5)';
                setTimeout(() => { el.style.color = ''; el.style.transform = ''; }, 400);
            });
        }
    } else {
        shotReloadTimer = SHOT_RELOAD_SECS; // full — keep bar full
    }
}

function resetKickoff(side) {
    kickoff = true;
    kickoffSide = side;
    kickoffCountdown = 3;
    ball.x = WIDTH / 2;
    ball.y = HEIGHT - 120;
    ball.dx = 0;
    ball.dy = 0;
    ball.angle = 0;
    ball.trail = [];
    ball.lastTouch = "player";
    
    player.x = WIDTH / 2 - 240;
    player.y = HEIGHT - player.h;
    player.dy = 0;
    player.jump = false;
    player.angle = 0;
    player.scaleX = 1;
    player.scaleY = 1;
    player.landTimer = 0;
    player.animState = "idle";
    player.animFrame = 0;
    player.animTimer = 0;
    player.kickTimer = 0;
    player.facing = 1;
    
    opponent.x = WIDTH / 2 + 140;
    opponent.y = HEIGHT - opponent.h;
    opponent.dy = 0;
    opponent.jump = false;
    opponent.active = false;
    opponent.shooting = false;
    opponent.angle = 0;
    opponent.scaleX = 1;
    opponent.scaleY = 1;
    opponent.landTimer = 0;
    opponent.animState = "idle";
    opponent.animFrame = 0;
    opponent.animTimer = 0;
    opponent.kickTimer = 0;
    opponent.facing = -1;
    
    particles = [];
    
    setTimeout(() => {
        ball.dx = side === "player" ? 3.0 : -3.0;
        kickoff = false;
    }, 2000);
}

// ================= DRAW FUNCTIONS =================
function drawField() {
    ctx.drawImage(bgImg, 0, 0, WIDTH, HEIGHT);

    const lw = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = lw;
    ctx.setLineDash([]);

    // Outer boundary
    ctx.strokeRect(10, 10, WIDTH - 20, HEIGHT - 20);

    // Centre line
    ctx.setLineDash([15, 10]);
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2, 10);
    ctx.lineTo(WIDTH / 2, HEIGHT - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    // Centre circle
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, 90, 0, Math.PI * 2);
    ctx.stroke();
    // Centre spot
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();

    // Penalty areas
    const penW = 200, penH = 400;
    // Left penalty area
    ctx.strokeRect(10, HEIGHT / 2 - penH / 2, penW, penH);
    // Right penalty area
    ctx.strokeRect(WIDTH - 10 - penW, HEIGHT / 2 - penH / 2, penW, penH);

    // Goal areas (6-yard box)
    const gaW = 100, gaH = 180;
    ctx.strokeRect(10, HEIGHT / 2 - gaH / 2, gaW, gaH);
    ctx.strokeRect(WIDTH - 10 - gaW, HEIGHT / 2 - gaH / 2, gaW, gaH);

    // Penalty spots
    const spotR = 5;
    ctx.beginPath();
    ctx.arc(160, HEIGHT / 2, spotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(WIDTH - 160, HEIGHT / 2, spotR, 0, Math.PI * 2);
    ctx.fill();

    // Corner arcs
    const cr = 20;
    [
        [10, 10, 0, Math.PI / 2],
        [WIDTH - 10, 10, Math.PI / 2, Math.PI],
        [WIDTH - 10, HEIGHT - 10, Math.PI, 3 * Math.PI / 2],
        [10, HEIGHT - 10, 3 * Math.PI / 2, 2 * Math.PI],
    ].forEach(([cx, cy, sa, ea]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, cr, sa, ea);
        ctx.stroke();
    });

    drawGoal(true);
    drawGoal(false);
}

function drawGoal(isLeft) {
    const goalWidth = 100;
    const goalHeight = 260;
    const PT = 14; // post thickness

    const frontX = isLeft ? goalWidth : WIDTH - goalWidth;
    const netL   = isLeft ? 0 : WIDTH - goalWidth;
    const goalTop = HEIGHT - goalHeight;

    // ── Net background ───────────────────────────────────────────────────────
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(netL, goalTop, goalWidth, goalHeight);

    // Net grid lines
    ctx.save();
    ctx.beginPath();
    ctx.rect(netL, goalTop, goalWidth, goalHeight);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    const step = 14;
    ctx.beginPath();
    for (let x = netL; x <= netL + goalWidth; x += step) {
        ctx.moveTo(x, goalTop); ctx.lineTo(x, HEIGHT);
    }
    for (let y = goalTop; y <= HEIGHT; y += step) {
        ctx.moveTo(netL, y); ctx.lineTo(netL + goalWidth, y);
    }
    ctx.stroke();
    ctx.restore();

    // ── Back post (thin, at screen edge, gray) ───────────────────────────────
    const backW = PT * 0.5;
    ctx.fillStyle = "#999999";
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 1.5;
    if (isLeft) {
        ctx.fillRect(0, goalTop, backW, goalHeight);
        ctx.strokeRect(0, goalTop, backW, goalHeight);
    } else {
        ctx.fillRect(WIDTH - backW, goalTop, backW, goalHeight);
        ctx.strokeRect(WIDTH - backW, goalTop, backW, goalHeight);
    }

    // ── Crossbar (white, horizontal, at goalTop) ─────────────────────────────
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.fillRect(netL, goalTop - PT / 2, goalWidth, PT);
    ctx.strokeRect(netL, goalTop - PT / 2, goalWidth, PT);
    // crossbar highlight
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(netL + 2, goalTop - PT / 2 + 2, goalWidth - 4, 3);

    // ── Front post (white, vertical, at field edge) ──────────────────────────
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.fillRect(frontX - PT / 2, goalTop, PT, goalHeight);
    ctx.strokeRect(frontX - PT / 2, goalTop, PT, goalHeight);
    // front post highlight
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(frontX - PT / 2 + 2, goalTop + 2, 3, goalHeight - 4);
}

function drawPlayer(p, charData) {
    if (p.landTimer > 0) {
        p.landTimer--;
        p.scaleX += (1 - p.scaleX) * 0.15;
        p.scaleY += (1 - p.scaleY) * 0.15;
    } else if (p.jump) {
        const stretchAmount = Math.min(0.2, Math.abs(p.dy) * 0.015);
        p.scaleX = 1 - stretchAmount;
        p.scaleY = 1 + stretchAmount;
    } else {
        p.scaleX = 1;
        p.scaleY = 1;
    }

    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h);
    ctx.rotate(p.angle);
    
    const facing = p.facing || 1;
    ctx.scale(p.scaleX * facing, p.scaleY);
    
    if (charData.isSpriteSheet) {
        let row = 0; // Walk row
        let col = p.animFrame;
        
        if (p.animState === "kick") {
            row = 1;
            col = p.animFrame % 4;
        } else if (p.animState === "walk") {
            row = 0;
            col = p.animFrame % 6;
        } else if (p.animState === "jump") {
            row = 0;
            col = 2; // Jump frame
        } else {
            row = 0;
            col = 0; // Idle
        }
        
        const sw = charData.img.naturalWidth / 6;
        const sh = charData.img.naturalHeight / 2;
        const sx = col * sw;
        const sy = row * sh;
        
        ctx.drawImage(charData.img, sx, sy, sw, sh, -p.w / 2, -p.h, p.w, p.h);
    } else {
        ctx.drawImage(charData.img, -p.w / 2, -p.h, p.w, p.h);
    }
    ctx.restore();
}

function drawBall() {
    const speed = Math.hypot(ball.dx, ball.dy);
    if (speed > 4 && ball.trail.length > 1) {
        for (let i = 0; i < ball.trail.length; i++) {
            const pos = ball.trail[i];
            const ratio = (i + 1) / ball.trail.length;
            ctx.globalAlpha = ratio * 0.25;
            ctx.drawImage(
                ballImg,
                pos.x - ball.r,
                pos.y - ball.r,
                ball.r * 2 * (0.6 + ratio * 0.4),
                ball.r * 2 * (0.6 + ratio * 0.4)
            );
        }
        ctx.globalAlpha = 1.0;
    }

    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.angle);
    ctx.drawImage(ballImg, -ball.r, -ball.r, ball.r * 2, ball.r * 2);
    ctx.restore();
}

function drawText(text, x, y, size = 24) {
    ctx.fillStyle = "#fff";
    ctx.font = `${size}px Bangers, Arial`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 4;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
}

// ================= HUD =================
function updateHUD() {
    playerScoreDisplay.textContent = scorePlayer;
    opponentScoreDisplay.textContent = scoreOpponent;
    matchTimeDisplay.textContent = formatTime(matchTime);
    specialShotsDisplay.textContent = specialShots;
    if (specialShotsMiniDisplay) specialShotsMiniDisplay.textContent = specialShots;
    highScoreDisplay.textContent = highScore;

    // Reload progress bar
    const reloadBar = document.getElementById('reloadBar');
    if (reloadBar) {
        const pct = specialShots >= MAX_SPECIAL_SHOTS
            ? 100
            : Math.min(100, (shotReloadTimer / SHOT_RELOAD_SECS) * 100);
        reloadBar.style.width = pct + '%';
        reloadBar.style.background = specialShots >= MAX_SPECIAL_SHOTS ? '#4caf50' : '#ff7a00';
    }
}

function formatTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ================= COLLISION =================
function collision(obj) {
    const dx = ball.x - Math.max(obj.x, Math.min(ball.x, obj.x + obj.w));
    const dy = ball.y - Math.max(obj.y, Math.min(ball.y, obj.y + obj.h));
    return (dx * dx + dy * dy) < ball.r * ball.r;
}

// ================= HIGH SCORES =================
async function updateHighScoresList() {
    const list = document.getElementById("highScoresList");
    list.innerHTML = '<div style="text-align:center; padding: 20px; font-weight:bold;">Loading scores...</div>';
    
    if (!supabaseClient) {
        list.innerHTML = "";
        const localHigh = parseInt(safeStorage.getItem('highScore') || 0);
        const localWins = parseInt(safeStorage.getItem('wins') || 0);
        const localPlayTime = parseInt(safeStorage.getItem('playTime') || 0);
        
        if (localPlayTime > 0) {
            const li = document.createElement("li");
            li.style.display = "grid";
            li.style.gridTemplateColumns = "2.5fr 1fr 1fr 1.2fr";
            li.style.gap = "10px";
            li.style.alignItems = "center";
            
            li.innerHTML = `
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">1. ${currentUsername || '@player'}</span>
                <span style="text-align:right; font-weight:bold; color:var(--pepe-yellow, #ff7a00);">${localHigh}</span>
                <span style="text-align:right;">${localWins}</span>
                <span style="text-align:right; font-size: 0.95rem;">${formatTotalPlayTime(localPlayTime)}</span>
            `;
            list.appendChild(li);
        } else {
            list.innerHTML = '<div style="text-align:center; padding: 20px; font-weight:bold;">No high scores yet!</div>';
        }
        return;
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('leaderboard')
            .select('username, high_score, wins, play_time')
            .gt('play_time', 0) // Only show players who have actually played a game
            .order('high_score', { ascending: false })
            .limit(10);
            
        if (error) throw error;
        
        list.innerHTML = "";
        if (data && data.length > 0) {
            data.forEach((row, idx) => {
                const li = document.createElement("li");
                li.style.display = "grid";
                li.style.gridTemplateColumns = "2.5fr 1fr 1fr 1.2fr";
                li.style.gap = "10px";
                li.style.alignItems = "center";
                
                li.innerHTML = `
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${idx + 1}. ${row.username}</span>
                    <span style="text-align:right; font-weight:bold; color:var(--pepe-yellow, #ff7a00);">${row.high_score}</span>
                    <span style="text-align:right;">${row.wins || 0}</span>
                    <span style="text-align:right; font-size: 0.95rem;">${formatTotalPlayTime(row.play_time || 0)}</span>
                `;
                
                if (row.username === currentUsername) {
                    li.style.background = "var(--pepe-amber)";
                    li.style.borderColor = "var(--pepe-yellow)";
                }
                list.appendChild(li);
            });
        } else {
            list.innerHTML = '<div style="text-align:center; padding: 20px; font-weight:bold;">No high scores yet!</div>';
        }
    } catch (err) {
        console.error(err);
        list.innerHTML = '<div style="text-align:center; padding: 20px; font-weight:bold; color:red;">Failed to load leaderboard</div>';
    }
}

async function saveMatchStats() {
    if (!currentUsername) return;

    const addedTime = Math.floor(sessionPlayTime);
    sessionPlayTime -= addedTime; // Keep fractional seconds

    totalPlayTime += addedTime;

    // Save to local storage for offline fallback
    safeStorage.setItem('playTime', totalPlayTime);
    safeStorage.setItem('wins', totalWins);
    safeStorage.setItem('highScore', highScore);

    // Update Main Menu UI stats immediately
    const statsBoxes = document.querySelectorAll('.menu-stats .stat-box');
    if (statsBoxes.length >= 3) {
        statsBoxes[0].querySelector('.stat-value').textContent = formatTotalPlayTime(totalPlayTime);
        statsBoxes[1].querySelector('.stat-value').textContent = highScore;
        statsBoxes[2].querySelector('.stat-value').textContent = totalWins;
    }

    if (!supabaseClient) return;

    try {
        const password = safeStorage.getItem('own_goal_password');
        const { error } = await supabaseClient
            .rpc('update_user_stats', {
                p_username: currentUsername,
                p_password: password,
                p_high_score: highScore,
                p_wins: totalWins,
                p_play_time: totalPlayTime
            });
            
        if (error) throw error;
    } catch (err) {
        console.error("Failed to save match stats to Supabase:", err);
    }
}

// ================= END MATCH =================
function endMatch() {
    started = false;
    paused = true;
    pausePanel.style.display = 'none';
    crowdCheerSound.pause();
    crowdCheerSound.currentTime = 0;

    // Determine win state
    if (scorePlayer > scoreOpponent) {
        totalWins++;
    }

    // Save high score if achieved
    if (scorePlayer > highScore) {
        highScore = scorePlayer;
        safeStorage.setItem('highScore', highScore);
        
        const msg = document.createElement("div");
        msg.innerHTML = "🏆 NEW HIGH SCORE! 🏆";
        msg.style.position = "absolute";
        msg.style.top = "160px";
        msg.style.left = "50%";
        msg.style.transform = "translateX(-50%)";
        msg.style.color = "var(--pepe-yellow)";
        msg.style.fontFamily = "'Bangers', cursive";
        msg.style.fontSize = "2.5rem";
        msg.style.textShadow = "3px 3px 0 black";
        msg.style.zIndex = "100";
        msg.style.animation = "pulse 1s infinite";
        document.querySelector(".game-wrapper").appendChild(msg);
        setTimeout(() => msg.remove(), 4000);
    }

    // Save total play time and wins
    saveMatchStats();

    matchOverPanel.style.display = "flex";
    document.getElementById("finalPlayerScore").textContent = scorePlayer;
    document.getElementById("finalOpponentScore").textContent = scoreOpponent;
}

// ================= RESTART =================
function restartMatch(startImmediately = true) {
    scorePlayer = 0;
    scoreOpponent = 0;
    matchTime = 180;
    lastMinuteCheck = 180;
    specialShots = MAX_SPECIAL_SHOTS;
    shotReloadTimer = SHOT_RELOAD_SECS;
    kickoff = true;
    kickoffCountdown = 3;
    
    player.x = 150;
    player.y = HEIGHT - player.h;
    player.dy = 0;
    player.jump = false;
    player.angle = 0;
    player.scaleX = 1;
    player.scaleY = 1;
    player.landTimer = 0;
    player.animState = "idle";
    player.animFrame = 0;
    player.animTimer = 0;
    player.kickTimer = 0;
    player.facing = 1;
    
    opponent.x = WIDTH - 300;
    opponent.y = HEIGHT - opponent.h;
    opponent.dy = 0;
    opponent.jump = false;
    opponent.active = false;
    opponent.shooting = false;
    opponent.angle = 0;
    opponent.scaleX = 1;
    opponent.scaleY = 1;
    opponent.landTimer = 0;
    opponent.animState = "idle";
    opponent.animFrame = 0;
    opponent.animTimer = 0;
    opponent.kickTimer = 0;
    opponent.facing = -1;
    
    ball.x = WIDTH / 2;
    ball.y = HEIGHT - 120;
    ball.dx = 0;
    ball.dy = 0;
    ball.angle = 0;
    ball.trail = [];
    
    particles = [];
    
    matchOverPanel.style.display = "none";
    pausePanel.style.display = "none";
    started = startImmediately;
    paused = false;
    updateHUD();

    if (startImmediately) {
        playAudio(bgMusic);
    } else {
        crowdCheerSound.pause();
        crowdCheerSound.currentTime = 0;
    }
}

// ================= BUTTON EVENT LISTENERS =================
document.getElementById("replayBtn").addEventListener("click", () => {
    restartMatch();
    matchOverPanel.style.display = "none";
});

document.getElementById("mainMenuBtn").addEventListener("click", () => {
    matchOverPanel.style.display = "none";
    gameContainer.style.display = "none";
    homeMenu.style.display = "flex";
    setBackgroundTrack(audioTracks.menu);
    restartMatch(false);
});

// ================= MOBILE SUPPORT =================

/* --- Canvas / layout sizing for mobile ---
   Portrait & Landscape phones: JS precisely sizes the canvas between the
                                48px scoreboard and 72px controls strips.
   Desktop/tablet:              Clear all inline styles; CSS min() rules apply.
*/
function fitCanvasMobile() {
    const isPortrait    = window.innerWidth  <  window.innerHeight;
    const mobileCtrl    = document.getElementById('mobileControls');
    
    // Check if the viewport is mobile-sized (either short landscape or narrow portrait)
    const isMobileSize  = window.innerHeight <= 500 || window.innerWidth <= 500;

    if (!isMobileSize) {
        // Desktop / wide tablet — clear inline styles and let CSS layout handle it
        canvas.style.width  = '';
        canvas.style.height = '';
        if (mobileCtrl) mobileCtrl.style.display = '';
        return;
    }

    const HUD_H  = 48;
    const CTRL_H = 90;
    
    let availH, availW;
    
    if (isPortrait) {
        // In portrait mode, the container is rotated -90deg.
        // Screen width acts as height, screen height acts as width.
        availH = window.innerWidth - HUD_H - CTRL_H;
        availW = window.innerHeight;
    } else {
        // Landscape mobile
        availH = window.innerHeight - HUD_H - CTRL_H;
        availW = window.innerWidth;
    }

    let ch = availH;
    let cw = ch * (16 / 9);
    if (cw > availW) { 
        cw = availW; 
        ch = cw * (9 / 16); 
    }

    canvas.style.width  = Math.round(cw) + 'px';
    canvas.style.height = Math.round(ch) + 'px';

    if (mobileCtrl) mobileCtrl.style.display = 'flex';
}

window.addEventListener('resize', fitCanvasMobile);
window.addEventListener('orientationchange', () => setTimeout(fitCanvasMobile, 200));
fitCanvasMobile();

/* --- Touch controls wiring --- */
(function setupMobileControls() {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Directional buttons — mirror key state using Pointer Events
    const dirMap = {
        mobLeft:  'ArrowLeft',
        mobRight: 'ArrowRight',
        mobJump:  'ArrowUp',
    };

    Object.entries(dirMap).forEach(([id, code]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const press = e => { e.preventDefault(); keys[code] = true;  btn.classList.add('active'); };
        const lift  = e => { e.preventDefault(); keys[code] = false; btn.classList.remove('active'); };
        btn.addEventListener('pointerdown',   press, { passive: false });
        btn.addEventListener('pointerup',     lift,  { passive: false });
        btn.addEventListener('pointercancel', lift,  { passive: false });
        btn.addEventListener('pointerleave',  lift,  { passive: false });
    });

    // Kick button
    const mobKick = document.getElementById('mobKick');
    if (mobKick) {
        mobKick.addEventListener('pointerdown', e => {
            e.preventDefault();
            mobKick.classList.add('active');
            if (started && !kickoff && !paused) {
                shootBall(player, 10.0, -8.0);
                player.kickTimer = 16;
                player.animFrame = 0;
            }
        }, { passive: false });
        const kickEnd = e => {
            e.preventDefault();
            mobKick.classList.remove('active');
        };
        mobKick.addEventListener('pointerup',     kickEnd, { passive: false });
        mobKick.addEventListener('pointercancel', kickEnd, { passive: false });
        mobKick.addEventListener('pointerleave',  kickEnd, { passive: false });
    }

    // Special button
    const mobSpecial = document.getElementById('mobSpecial');
    if (mobSpecial) {
        mobSpecial.addEventListener('pointerdown', e => {
            e.preventDefault();
            mobSpecial.classList.add('active');
            if (started && !kickoff && !paused) {
                if (specialShots > 0) {
                    specialShoot(player);
                    player.kickTimer = 16;
                    player.animFrame = 0;
                } else {
                    showNoShotsFlash();
                }
            }
        }, { passive: false });
        const specEnd = e => { e.preventDefault(); mobSpecial.classList.remove('active'); };
        mobSpecial.addEventListener('pointerup',     specEnd, { passive: false });
        mobSpecial.addEventListener('pointercancel', specEnd, { passive: false });
        mobSpecial.addEventListener('pointerleave',  specEnd, { passive: false });
    }

    // If touch device: show controls and trigger initial layout
    if (isTouchDevice) fitCanvasMobile();
})();

// ================= INITIALIZE GAME =================
init();
