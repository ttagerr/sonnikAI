const API_BASE = 'http://localhost:3000/api';
let currentChatId = null;
let currentSessionId = localStorage.getItem('sessionId');
let isMenuOpen = false;
let recognition = null;
let isListening = false;
let isGuestMode = true;
let guestUserId = 'guest-' + Math.random().toString(36).substr(2, 9);
let userLimits = {
    is_premium: false,
    requests_used: 0,
    max_requests: 15,
    max_chats: 1,
    current_chats: 0,
    requests_remaining: 15
};

// DOM элементы
const sideMenu = document.querySelector('.sidebar');
const menuToggle = document.getElementById('menuToggle');
const chatsList = document.getElementById('chatsList');
const menuNewChat = document.getElementById('menuNewChat');
const welcomeScreen = document.getElementById('welcomeScreen');
const messagesContainer = document.getElementById('messagesContainer');
const messagesList = document.getElementById('messagesList');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const voiceBtn = document.getElementById('voiceBtn');
const ttsBtn = document.getElementById('ttsBtn');
const modalOverlay = document.getElementById('modalOverlay');
const modalContent = document.getElementById('modalContent');
const notificationContainer = document.getElementById('notificationContainer');
const sidebarOverlay = document.getElementById('sidebarOverlay');

// Элементы для управления видимостью
const guestInfo = document.getElementById('guestInfo');
const authContent = document.getElementById('authContent');
const menuFooter = document.getElementById('menuFooter');
const prevChatsLabel = document.querySelector('.prev-chats-label');

// Элементы модального окна авторизации
const authModal = document.getElementById('authModal');
const authLoginBtn = document.getElementById('auth-login-btn');
const authRegisterBtn = document.getElementById('auth-register-btn');
const authLoginPhone = document.getElementById('auth-login-phone');
const authRegPhone = document.getElementById('auth-reg-phone');
const authRegName = document.getElementById('auth-reg-name');
const authRegEmail = document.getElementById('auth-reg-email');
const authRegBirthdate = document.getElementById('auth-reg-birthdate');

// Проверка авторизации при загрузке
console.log('=== APP.JS STARTED ===');

// Функция для обновления информации о лимитах гостя
function updateGuestLimits() {
    if (!isGuestMode) return;
    
    const guestLimitsElement = document.getElementById('guestLimits');
    if (!guestLimitsElement) return;
    
    const guestRequests = JSON.parse(localStorage.getItem('guestRequests') || '{"count": 0, "lastReset": "' + new Date().toISOString() + '"}');
    const remaining = Math.max(0, 5 - guestRequests.count);
    
    guestLimitsElement.innerHTML = `Осталось запросов: ${remaining}/5`;
    
    // Меняем цвет если лимит почти исчерпан
    if (remaining <= 1) {
        guestLimitsElement.style.color = '#ff6b6b';
    } else if (remaining <= 3) {
        guestLimitsElement.style.color = '#ffa726';
    } else {
        guestLimitsElement.style.color = '#8b9ccf';
    }
}

async function initApp() {
    console.log('🚀 INIT APP - Checking authentication...');
    
    const sessionId = localStorage.getItem('sessionId');
    const userId = localStorage.getItem('userId');
    const userName = localStorage.getItem('userName');
    
    // Сначала проверяем валидность сессии через API
    if (sessionId && userId) {
        console.log('🔐 Checking session validity...');
        const authStatus = await checkAuthStatus();
        
        if (authStatus.success) {
            console.log('✅ User is authenticated (valid session)');
            isGuestMode = false;
            await setupAuthenticatedUser(authStatus.user);
            
            // Загружаем сохраненную аватарку
            loadSavedAvatar();
            
        } else if (authStatus.banned) {
            // Пользователь забанен, уже показали уведомление
            console.log('🚫 User is banned');
        } else {
            // Сессия невалидна, переходим в гостевой режим
            console.log('❌ Session invalid, switching to guest mode');
            localStorage.removeItem('sessionId');
            setupGuestUser();
        }
    } else {
        console.log('👤 Guest mode activated (no session)');
        setupGuestUser();
    }
    
    // Добавляем обработчик изменения размера окна
    window.addEventListener('resize', handleResize);
    handleResize(); // Вызываем сразу
    
    // Добавляем обработчик для мобильной клавиатуры
    setupMobileKeyboardHandling();
    
    initSpeechRecognition();
    setupAuthModalListeners();
    setupAuthModalKeyListeners();
    setupEventListeners();
}
// Функция для обработки мобильной клавиатуры
function setupMobileKeyboardHandling() {
    if (!messageInput) return;
    
    messageInput.addEventListener('focus', function() {
        if (window.innerWidth <= 768) {
            console.log('📱 Mobile keyboard focused');
            
            // Закрываем сайдбар если открыт
            closeSideMenu();
            
            // Плавно скроллим вниз
            setTimeout(() => {
                scrollToBottom();
            }, 300);
        }
    });
    
    messageInput.addEventListener('blur', function() {
        if (window.innerWidth <= 768) {
            console.log('📱 Mobile keyboard hidden');
            // Дополнительный скролл после скрытия клавиатуры
            setTimeout(() => {
                scrollToBottom();
            }, 500);
        }
    });
}

// Функция для обработки изменения размера окна
function handleResize() {
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        document.body.classList.add('mobile-view');
        
        // Закрываем сайдбар при повороте экрана
        closeSideMenu();
        
    } else {
        document.body.classList.remove('mobile-view');
    }
    
    // Пересчитываем позицию инпута если нужно
    setTimeout(scrollToBottom, 100);
}

// Функции для работы с премиумом
// Обновим функцию loadUserLimits
// Загрузка информации о лимитах пользователя
async function loadUserLimits() {
    if (isGuestMode) return;
    
    try {
        console.log('📊 Loading user limits...');
        const response = await makeAuthenticatedRequest(`${API_BASE}/user/limits`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                userLimits = data.user;
                console.log('📊 User limits loaded:', userLimits);
            } else {
                console.log('❌ User limits loading failed:', data.error);
                throw new Error(data.error || 'Failed to load limits');
            }
        } else {
            console.log('❌ User limits HTTP error:', response.status);
            throw new Error(`HTTP error: ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Error loading user limits:', error);
        
        // Проверяем не забанен ли пользователь
        if (error.message === 'Account is banned') {
            return;
        }
        
        // Если сессия истекла, разлогиниваем
        if (error.message === 'Session expired' || error.message.includes('401')) {
            console.log('🔐 Session expired during limits load');
            localStorage.removeItem('sessionId');
            showNotification('Сессия истекла. Пожалуйста, войдите снова.', 'info');
            setupGuestUser();
            return;
        }
        
        showNotification('Ошибка загрузки лимитов', 'error');
    }
}
function showPremiumModal() {
    const premiumHTML = `
        <div class="premium-modal">
            <div class="premium-header">
                <h2>💎 ИИ Сонник Premium</h2>
                <button class="close-premium" onclick="hidePremiumModal()">×</button>
            </div>
            
            <div class="premium-features">
                <div class="premium-feature">
                    <span class="feature-icon">∞</span>
                    <div class="feature-text">
                        <h4>Бесконечные чаты</h4>
                        <p>Создавайте неограниченное количество чатов для анализа снов</p>
                    </div>
                </div>
                
                <div class="premium-feature">
                    <span class="feature-icon">🚀</span>
                    <div class="feature-text">
                        <h4>Безлимитные запросы</h4>
                        <p>Задавайте сколько угодно вопросов об своих снах</p>
                    </div>
                </div>
                
                <div class="premium-feature">
                    <span class="feature-icon">⭐</span>
                    <div class="feature-text">
                        <h4>Приоритетная поддержка</h4>
                        <p>Получайте ответы быстрее и более детальные анализы</p>
                    </div>
                </div>
            </div>

            <div class="premium-plans">
                <div class="premium-plan" onclick="purchasePremium('monthly')">
                    <div class="plan-header">
                        <h3>Месяц</h3>
                        <div class="plan-price">
                            <span class="price">299 ₽</span>
                            <span class="period">в месяц</span>
                        </div>
                    </div>
                    <ul class="plan-features">
                        <li>✓ Безлимитные чаты</li>
                        <li>✓ Безлимитные запросы</li>
                        <li>✓ Приоритетная поддержка</li>
                    </ul>
                    <button class="plan-btn">Выбрать</button>
                </div>
                
                <div class="premium-plan popular" onclick="purchasePremium('yearly')">
                    <div class="plan-badge">Выгодно</div>
                    <div class="plan-header">
                        <h3>Год</h3>
                        <div class="plan-price">
                            <span class="price">2 990 ₽</span>
                            <span class="period">в год</span>
                        </div>
                    </div>
                    <div class="plan-savings">Экономия 590 ₽</div>
                    <ul class="plan-features">
                        <li>✓ Безлимитные чаты</li>
                        <li>✓ Безлимитные запросы</li>
                        <li>✓ Приоритетная поддержка</li>
                        <li>✓ Персональный анализ</li>
                    </ul>
                    <button class="plan-btn popular-btn">Выбрать</button>
                </div>
            </div>

            <div class="premium-guarantee">
                <p>🔒 Безопасная оплата • 💰 Возврат в течение 14 дней</p>
            </div>
        </div>
    `;
    
    if (modalContent && modalOverlay) {
        modalContent.innerHTML = premiumHTML;
        modalOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function hidePremiumModal() {
    if (modalOverlay) {
        modalOverlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

async function purchasePremium(plan) {
    if (isGuestMode) {
        showAuthModal();
        showNotification('Авторизуйтесь для покупки премиума', 'info');
        return;
    }

    try {
        showNotification('Обрабатываем оплату...', 'info');
        
        const response = await makeAuthenticatedRequest(`${API_BASE}/premium/purchase`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: plan })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showNotification(`Премиум активирован! Срок действия: ${plan === 'yearly' ? '1 год' : '1 месяц'}`, 'success');
                hidePremiumModal();
                
                // Обновляем лимиты
                await loadUserLimits();
                
                // Обновляем интерфейс профиля если он открыт
                if (modalOverlay.style.display === 'flex') {
                    showProfile();
                }
            }
        } else {
            const errorData = await response.json();
            showNotification(errorData.error || 'Ошибка при оплате', 'error');
        }
    } catch (error) {
        console.error('Purchase premium error:', error);
        showNotification('Ошибка соединения с сервером', 'error');
    }
}

function checkChatLimit() {
    if (isGuestMode) return true;
    
    if (userLimits.is_premium) {
        return true;
    }
    
    if (userLimits.current_chats >= userLimits.max_chats) {
        // УЛУЧШЕННОЕ СООБЩЕНИЕ ДЛЯ АВТОРИЗОВАННЫХ ПОЛЬЗОВАТЕЛЕЙ
        showNotification(`❌ Закончились лимиты чатов! Купите премиум для безлимитного доступа`, 'error');
        showPremiumModal();
        return false;
    }
    
    return true;
}

function checkRequestsLimit() {
    if (isGuestMode) return true;
    
    if (userLimits.is_premium) {
        return true;
    }
    
    if (userLimits.requests_used >= userLimits.max_requests) {
        // УЛУЧШЕННОЕ СООБЩЕНИЕ ДЛЯ АВТОРИЗОВАННЫХ ПОЛЬЗОВАТЕЛЕЙ
        showNotification(`❌ Закончились лимиты! Купите премиум для безлимитного доступа`, 'error');
        showPremiumModal();
        return false;
    }
    
    return true;
}

function setupGuestUser() {
    console.log('🔄 Setting up guest user interface');
    isGuestMode = true;
    
    // ЗАКРЫВАЕМ ТЕКУЩИЙ ЧАТ И ПОКАЗЫВАЕМ WELCOME-ЭКРАН
    currentChatId = null;
    if (welcomeScreen) welcomeScreen.style.display = 'flex';
    if (messagesContainer) messagesContainer.style.display = 'none';
    if (messagesList) messagesList.innerHTML = '';
    
    // Показываем гостевую панель
    if (guestInfo) {
        guestInfo.style.display = 'block';
        console.log('✅ Guest info shown');
    }
    
    // Скрываем элементы для авторизованных пользователей
    const authElements = [
        { element: authContent, name: 'Auth Content' },
        { element: menuFooter, name: 'Menu Footer' },
        { element: prevChatsLabel, name: 'Prev Chats Label' },
        { element: menuNewChat, name: 'New Chat Button' }
    ];
    
    authElements.forEach(item => {
        if (item.element) {
            item.element.style.display = 'none';
            console.log(`❌ ${item.name} hidden`);
        }
    });
    
    // ИНИЦИАЛИЗИРУЕМ ИНФОРМАЦИЮ О ЛИМИТАХ
    updateGuestLimits();
    
    // НЕ ЗАГРУЖАЕМ ИСТОРИЮ ЧАТОВ ДЛЯ ГОСТЕЙ
    renderChatsList([]);
    
    // Показываем уведомление о гостевом режиме
    setTimeout(() => {
        showNotification('Вы в гостевом режиме. Доступно 5 запросов. Авторизуйтесь для безлимитного доступа.', 'info');
    }, 1000);
    
    hideAuthModal();
}

async function setupAuthenticatedUser(user) {
    console.log('🔄 Setting up authenticated user interface');
    isGuestMode = false;
    
    // ЗАКРЫВАЕМ ТЕКУЩИЙ ЧАТ И ПОКАЗЫВАЕМ WELCOME-ЭКРАН
    currentChatId = null;
    if (welcomeScreen) welcomeScreen.style.display = 'flex';
    if (messagesContainer) messagesContainer.style.display = 'none';
    if (messagesList) messagesList.innerHTML = '';
    
    // Скрываем гостевую панель
    if (guestInfo) {
        guestInfo.style.display = 'none';
        console.log('✅ Guest info hidden');
    }
    
    // ПОКАЗЫВАЕМ элементы для авторизованных пользователей
    const authElements = [
        { element: authContent, name: 'Auth Content' },
        { element: menuFooter, name: 'Menu Footer' },
        { element: prevChatsLabel, name: 'Prev Chats Label' },
        { element: menuNewChat, name: 'New Chat Button' }
    ];
    
    authElements.forEach(item => {
        if (item.element) {
            item.element.style.display = 'block';
            console.log(`✅ ${item.name} shown`);
        }
    });
    
    // Сохраняем все данные пользователя
    localStorage.setItem('userId', user.id);
    localStorage.setItem('userName', user.name);
    if (user.phone) localStorage.setItem('userPhone', user.phone);
    if (user.email) localStorage.setItem('userEmail', user.email);
    if (user.birth_date) localStorage.setItem('userBirthDate', user.birth_date);
    
    // Обновляем интерфейс
    const userNameElement = document.getElementById('userName');
    if (userNameElement) {
        userNameElement.textContent = user.name;
        console.log('✅ User name updated:', user.name);
    }
    
    const userAvatar = document.querySelector('.user-avatar');
    if (userAvatar) {
        // Проверяем есть ли сохраненная аватарка
        const savedAvatar = localStorage.getItem('userAvatar');
        if (savedAvatar) {
            userAvatar.style.backgroundImage = `url(${savedAvatar})`;
            userAvatar.style.backgroundSize = 'cover';
            userAvatar.style.backgroundPosition = 'center';
            userAvatar.textContent = '';
        } else {
            userAvatar.textContent = user.name ? user.name.charAt(0).toUpperCase() : 'U';
            userAvatar.style.background = 'linear-gradient(135deg, #7156f7 0%, #9a5bff 100%)';
        }
        console.log('✅ User avatar updated');
    }
    
    try {
        // Загружаем лимиты и чаты
        await loadUserLimits();
        await loadUserChats();
        
        // Проверяем права администратора и настраиваем кнопку
        await setupAdminButton();
        
        hideAuthModal();
        
        console.log('🎉 Authenticated user setup complete');
    } catch (error) {
        console.error('❌ Error during authenticated user setup:', error);
        // Если произошла ошибка, переходим в гостевой режим
        showNotification('Ошибка загрузки данных. Пожалуйста, войдите снова.', 'error');
        localStorage.removeItem('sessionId');
        setupGuestUser();
    }
}

// Улучшенная функция makeAuthenticatedRequest
async function makeAuthenticatedRequest(url, options = {}) {
    const sessionId = currentSessionId || localStorage.getItem('sessionId');
    if (sessionId) {
        if (!options.headers) options.headers = {};
        options.headers['Authorization'] = sessionId;
    }
    
    const response = await fetch(url, options);
    
    // Проверяем забанен ли пользователь
    if (response.status === 403) {
        try {
            const errorData = await response.json();
            if (errorData.is_banned) {
                console.log('🚫 User is banned during API request');
                // Принудительно разлогиниваем
                await forceLogoutDueToBan();
                throw new Error('Account is banned');
            }
        } catch (parseError) {
            // Не удалось распарсить JSON, пропускаем
        }
    }
    
    return response;
}

// Функция принудительного логаута при бане
async function forceLogoutDueToBan() {
    console.log('🚫 Force logout due to ban');
    
    // Очищаем все данные
    localStorage.clear();
    currentSessionId = null;
    currentChatId = null;
    isGuestMode = true;
    
    // Показываем уведомление
    showNotification('❌ Ваш аккаунт заблокирован. Обратитесь к администратору.', 'error');
    
    // Сбрасываем интерфейс
    if (welcomeScreen) welcomeScreen.style.display = 'flex';
    if (messagesContainer) messagesContainer.style.display = 'none';
    if (messagesList) messagesList.innerHTML = '';
    
    // Скрываем элементы для авторизованных пользователей
    if (authContent) authContent.style.display = 'none';
    if (menuFooter) menuFooter.style.display = 'none';
    if (prevChatsLabel) prevChatsLabel.style.display = 'none';
    if (menuNewChat) menuNewChat.style.display = 'none';
    
    // Показываем гостевую панель
    if (guestInfo) guestInfo.style.display = 'block';
    
    // Обновляем список чатов (пустой для гостя)
    renderChatsList([]);
    
    console.log('✅ User forcefully logged out due to ban');
}
// Функции для работы с аватаркой
function setupAvatarUpload() {
    const avatarInput = document.getElementById('avatar-upload');
    const avatarCircle = document.querySelector('.avatar-circle');
    
    if (avatarInput && avatarCircle) {
        avatarInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        // Сохраняем в localStorage
                        localStorage.setItem('userAvatar', e.target.result);
                        
                        // Обновляем аватарку в интерфейсе
                        updateUserAvatar(e.target.result);
                        
                        showNotification('Аватарка успешно обновлена', 'success');
                    };
                    reader.readAsDataURL(file);
                } else {
                    showNotification('Пожалуйста, выберите изображение', 'error');
                }
            }
        });
    }
}

function updateUserAvatar(avatarUrl) {
    // Обновляем в профиле
    const avatarCircle = document.querySelector('.avatar-circle');
    if (avatarCircle) {
        avatarCircle.style.backgroundImage = `url(${avatarUrl})`;
        avatarCircle.style.backgroundSize = 'cover';
        avatarCircle.style.backgroundPosition = 'center';
        avatarCircle.textContent = '';
    }
    
    // Обновляем в сайдбаре
    const userAvatar = document.querySelector('.user-avatar');
    if (userAvatar) {
        userAvatar.style.backgroundImage = `url(${avatarUrl})`;
        userAvatar.style.backgroundSize = 'cover';
        userAvatar.style.backgroundPosition = 'center';
        userAvatar.textContent = '';
    }
}

function loadSavedAvatar() {
    const savedAvatar = localStorage.getItem('userAvatar');
    if (savedAvatar) {
        updateUserAvatar(savedAvatar);
    }
}

// Функции профиля пользователя
function showProfile() {
    if (isGuestMode) {
        showAuthModal();
        showNotification('Авторизуйтесь для доступа к профилю', 'info');
        return;
    }
    
    const userData = getUserData();
    const savedAvatar = localStorage.getItem('userAvatar');
    
    const profileHTML = `
        <div class="profile-modal">
            <div class="profile-header">
                <h2>👤 Мой профиль</h2>
                <button class="close-profile" onclick="hideModal()">×</button>
            </div>
            
            <div class="profile-info">
                <div class="profile-avatar">
                    <div class="avatar-circle" style="${savedAvatar ? `background-image: url(${savedAvatar}); background-size: cover; background-position: center;` : ''}">
                        ${savedAvatar ? '' : (userData.name ? userData.name.charAt(0).toUpperCase() : 'U')}
                    </div>
                    <div style="margin-top: 15px;">
                        <input type="file" id="avatar-upload" accept="image/*" style="display: none;">
                        <button onclick="document.getElementById('avatar-upload').click()" class="change-avatar-btn">
                            📷 Сменить аватарку
                        </button>
                    </div>
                </div>
                
                <div class="profile-stats">
                    <h3>📊 Статистика</h3>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-number" id="totalChats">${userLimits.current_chats}</span>
                            <span class="stat-label">Чатов</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number" id="totalMessages">${userLimits.requests_used}</span>
                            <span class="stat-label">Запросов</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number" id="activeDays">${userLimits.is_premium ? '∞' : userLimits.requests_remaining}</span>
                            <span class="stat-label">${userLimits.is_premium ? 'Премиум' : 'Осталось'}</span>
                        </div>
                    </div>
                </div>
                
                ${!userLimits.is_premium ? `
                <div class="premium-promo">
                    <div class="premium-promo-content">
                        <h4>💎 Получите больше возможностей</h4>
                        <p>Премиум дает безлимитные чаты и запросы</p>
                        <button class="premium-promo-btn" onclick="showPremiumModal()">
                            Перейти на Premium
                        </button>
                    </div>
                </div>
                ` : `
                <div class="premium-active">
                    <div class="premium-badge">
                        <span class="premium-icon">💎</span>
                        <span>Premium активен</span>
                    </div>
                    <p class="premium-expiry">Действует до: ${new Date(userLimits.premium_expires_at).toLocaleDateString('ru-RU')}</p>
                </div>
                `}
                
                <div class="profile-form">
                    <h3>📝 Личная информация</h3>
                    <div class="form-group">
                        <label>Имя</label>
                        <input type="text" id="profile-name" value="${userData.name || ''}" placeholder="Ваше имя">
                    </div>
                    <div class="form-group">
                        <label>Телефон</label>
                        <input type="tel" id="profile-phone" value="${userData.phone || ''}" readonly>
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="profile-email" value="${userData.email || ''}" placeholder="email@example.com">
                    </div>
                    <div class="form-group">
                        <label>Дата рождения</label>
                        <input type="date" id="profile-birthdate" value="${userData.birth_date || ''}">
                    </div>
                    
                    <button class="save-profile-btn" onclick="saveProfile()">💾 Сохранить изменения</button>
                </div>
                
                <div class="profile-actions">
                    <button class="logout-btn" onclick="logout()">🚪 Выйти из аккаунта</button>
                </div>
            </div>
        </div>
    `;
    
    if (modalContent && modalOverlay) {
        modalContent.innerHTML = profileHTML;
        modalOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Настраиваем загрузку аватарки
        setTimeout(() => {
            setupAvatarUpload();
        }, 100);
    } else {
        console.error('Modal elements not found');
        return;
    }
}

function getUserData() {
    return {
        id: localStorage.getItem('userId'),
        name: localStorage.getItem('userName'),
        phone: localStorage.getItem('userPhone'),
        email: localStorage.getItem('userEmail'),
        birth_date: localStorage.getItem('userBirthDate')
    };
}

async function loadProfileStats() {
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) return;

        const response = await makeAuthenticatedRequest(`${API_BASE}/chats/${userId}`);
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                const totalChats = data.chats.length;
                let totalMessages = 0;
                
                // Подсчитываем общее количество сообщений
                for (const chat of data.chats) {
                    const messagesResponse = await makeAuthenticatedRequest(`${API_BASE}/chats/${chat.id}/messages`);
                    if (messagesResponse.ok) {
                        const messagesData = await messagesResponse.json();
                        if (messagesData.success) {
                            totalMessages += messagesData.messages.length;
                        }
                    }
                }
                
                // Обновляем статистику
                const totalChatsElement = document.getElementById('totalChats');
                const totalMessagesElement = document.getElementById('totalMessages');
                
                if (totalChatsElement) totalChatsElement.textContent = totalChats;
                if (totalMessagesElement) totalMessagesElement.textContent = totalMessages;
            }
        }
    } catch (error) {
        console.error('Error loading profile stats:', error);
    }
}

async function saveProfile() {
    const name = document.getElementById('profile-name')?.value.trim();
    const email = document.getElementById('profile-email')?.value.trim();
    const birthdate = document.getElementById('profile-birthdate')?.value;

    if (!name) {
        showNotification('Введите имя', 'error');
        return;
    }

    try {
        // Сохраняем в localStorage
        localStorage.setItem('userName', name);
        if (email) localStorage.setItem('userEmail', email);
        if (birthdate) localStorage.setItem('userBirthDate', birthdate);

        // Обновляем в интерфейсе
        const userNameElement = document.getElementById('userName');
        if (userNameElement) {
            userNameElement.textContent = name;
        }

        // Обновляем аватарку если нет загруженной
        const userAvatar = document.querySelector('.user-avatar');
        if (userAvatar && !localStorage.getItem('userAvatar')) {
            userAvatar.textContent = name.charAt(0).toUpperCase();
        }

        showNotification('Профиль успешно обновлен', 'success');
        
        // Закрываем модальное окно через секунду
        setTimeout(() => {
            hideModal();
        }, 1000);

    } catch (error) {
        console.error('Error saving profile:', error);
        showNotification('Ошибка сохранения профиля', 'error');
    }
}

// Функции модального окна авторизации
function setupAuthModalListeners() {
    // Переключение между вкладками
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            
            document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(`auth-${tab}-form`).classList.add('active');
        });
    });
    
    // Вход
    if (authLoginBtn) {
        authLoginBtn.addEventListener('click', handleAuthLogin);
    }
    
    // Регистрация
    if (authRegisterBtn) {
        authRegisterBtn.addEventListener('click', handleAuthRegister);
    }
    
    // Обработка Enter в формах
    if (authLoginPhone) {
        authLoginPhone.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleAuthLogin();
            }
        });
    }
    
    const authRegInputs = [authRegPhone, authRegName, authRegEmail, authRegBirthdate];
    authRegInputs.forEach(input => {
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleAuthRegister();
                }
            });
        }
    });
}

async function handleAuthLogin() {
    const phone = authLoginPhone.value.trim();
    
    if (!phone) {
        showNotification('Введите номер телефона', 'error');
        return;
    }

    console.log('🔐 AUTH LOGIN ATTEMPT with phone:', phone);

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });

        console.log('📡 Auth login response status:', response.status);
        
        const data = await response.json();
        console.log('📡 Auth login response data:', data);

        if (data.success) {
            console.log('✅ AUTH LOGIN SUCCESSFUL');
            
            // Сохраняем все данные пользователя
            localStorage.setItem('userId', data.user.id);
            localStorage.setItem('sessionId', data.sessionId);
            localStorage.setItem('userName', data.user.name);
            localStorage.setItem('userPhone', data.user.phone);
            localStorage.setItem('userEmail', data.user.email || '');
            localStorage.setItem('userBirthDate', data.user.birth_date || '');
            
            showNotification('Вход успешен!', 'success');
            hideAuthModal();
            
            // Настраиваем пользователя
            await setupAuthenticatedUser(data.user);
            
        } else {
            console.log('❌ AUTH LOGIN FAILED:', data.error);
            
            // Проверяем забанен ли пользователь
            if (data.is_banned) {
                showNotification('❌ Ваш аккаунт заблокирован. Обратитесь к администратору.', 'error');
            } else {
                showNotification('❌ Пользователь не найден. Проверьте номер телефона или зарегистрируйтесь', 'error');
            }
        }
    } catch (error) {
        console.error('💥 AUTH LOGIN ERROR:', error);
        showNotification('❌ Ошибка соединения с сервером', 'error');
    }
}
// Функция для проверки статуса авторизации
async function checkAuthStatus() {
    const sessionId = localStorage.getItem('sessionId');
    
    if (!sessionId) {
        return { success: false };
    }

    try {
        const response = await fetch(`${API_BASE}/auth/status`, {
            headers: {
                'Authorization': sessionId
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            return { success: true, user: data.user };
        } else {
            // Проверяем забанен ли пользователь
            if (data.is_banned) {
                console.log('🚫 User is banned, logging out...');
                // Очищаем localStorage и показываем сообщение
                localStorage.clear();
                showNotification('❌ Ваш аккаунт заблокирован. Обратитесь к администратору.', 'error');
                return { success: false, banned: true };
            }
            
            // Обычная ошибка авторизации
            console.log('❌ Auth status check failed:', data.message);
            return { success: false };
        }
    } catch (error) {
        console.error('Auth status check error:', error);
        return { success: false };
    }
}

async function handleAuthRegister() {
    const phone = authRegPhone.value.trim();
    const name = authRegName.value.trim();
    const email = authRegEmail.value.trim();
    const birthDate = authRegBirthdate.value;

    if (!phone || !name) {
        showNotification('Заполните обязательные поля: телефон и имя', 'error');
        return;
    }

    if (phone.length < 10) {
        showNotification('Введите корректный номер телефона', 'error');
        return;
    }

    try {
        console.log('🔐 AUTH REGISTER ATTEMPT:', { phone, name });
        
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, name, email, birth_date: birthDate })
        });

        console.log('📡 Auth register response status:', response.status);
        
        const data = await response.json();
        console.log('📡 Auth register response data:', data);

        if (data.success) {
            console.log('✅ AUTH REGISTRATION SUCCESSFUL');
            
            // Сохраняем все данные пользователя
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('sessionId', data.sessionId);
            localStorage.setItem('userName', name);
            localStorage.setItem('userPhone', phone);
            localStorage.setItem('userEmail', email || '');
            localStorage.setItem('userBirthDate', birthDate || '');
            
            showNotification('Регистрация успешна!', 'success');
            hideAuthModal();
            
            // Настраиваем пользователя
            const user = {
                id: data.userId,
                name: name,
                phone: phone,
                email: email,
                birth_date: birthDate
            };
            await setupAuthenticatedUser(user);
            
        } else {
            console.log('❌ AUTH REGISTRATION FAILED:', data.error);
            // УЛУЧШЕННОЕ СООБЩЕНИЕ ОБ ОШИБКЕ РЕГИСТРАЦИИ
            if (data.error && data.error.includes('уже существует')) {
                showNotification('❌ Пользователь с таким номером уже существует. Войдите в аккаунт', 'error');
            } else {
                showNotification('❌ Ошибка регистрации. Попробуйте еще раз', 'error');
            }
        }
    } catch (error) {
        console.error('💥 AUTH REGISTER ERROR:', error);
        showNotification('❌ Ошибка соединения с сервером', 'error');
    }
}
function setupAuthModalKeyListeners() {
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && authModal && authModal.style.display === 'flex') {
            hideAuthModal();
        }
    });
}
function showAuthModal() {
    if (authModal) {
        authModal.style.display = 'flex';
        // Сбрасываем формы
        if (authLoginPhone) authLoginPhone.value = '';
        if (authRegPhone) authRegPhone.value = '';
        if (authRegName) authRegName.value = '';
        if (authRegEmail) authRegEmail.value = '';
        if (authRegBirthdate) authRegBirthdate.value = '';
    }
}

function hideAuthModal() {
    if (authModal) {
        authModal.style.display = 'none';
        // Восстанавливаем скролл body
        document.body.style.overflow = 'auto';
    }
}

function hideModal() {
    if (modalOverlay) {
        modalOverlay.style.display = 'none';
        // Восстанавливаем скролл body
        document.body.style.overflow = 'auto';
    }
}

// ИСПРАВЛЕННАЯ функция генерации названия чата
// ИСПРАВЛЕННАЯ функция генерации названия чата (одинаковая на клиенте и сервере)
function generateChatTitle(firstMessage) {
    console.log('🎯 CLIENT: Generating title for:', firstMessage);
    
    if (!firstMessage || firstMessage.trim() === '') {
        return '💭 Новый сон';
    }

    const cleanMessage = firstMessage.trim();
    const cleanText = cleanMessage.replace(/\s+/g, ' ').substring(0, 100);
    const words = cleanText.split(' ').filter(word => word.length > 0);
    
    if (words.length === 0) {
        return '💭 Новый сон';
    }
    
    let title = '💭 ';
    
    // Упрощенная логика - берем первые 3-4 слова всегда
    const wordsToUse = words.slice(0, 4);
    title += wordsToUse.join(' ');
    
    // Добавляем многоточие если текст длинный
    if (cleanText.length > 25 || words.length > 4) {
        title += '...';
    }
    
    // Ограничиваем длину
    if (title.length > 40) {
        title = title.substring(0, 37) + '...';
    }
    
    console.log('🎯 CLIENT Final title:', title);
    return title;
}

// Функции работы с чатами
// Обновим функцию loadUserChats
// Загрузка чатов пользователя
async function loadUserChats() {
    const userId = localStorage.getItem('userId');
    if (!userId) return;

    try {
        const response = await makeAuthenticatedRequest(`${API_BASE}/chats/${userId}`);
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                renderChatsList(data.chats);
            } else {
                console.log('❌ Chats loading failed:', data.error);
            }
        } else {
            console.log('❌ Chats loading HTTP error:', response.status);
        }
    } catch (error) {
        console.error('❌ Error loading chats:', error);
        
        // Проверяем не забанен ли пользователь
        if (error.message === 'Account is banned') {
            return;
        }
        
        // Если сессия истекла, разлогиниваем
        if (error.message === 'Session expired' || error.message.includes('401')) {
            console.log('🔐 Session expired during chats load');
            localStorage.removeItem('sessionId');
            showNotification('Сессия истекла. Пожалуйста, войдите снова.', 'info');
            setupGuestUser();
            return;
        }
        
        showNotification('Ошибка загрузки чатов', 'error');
    }
}

function loadGuestChats() {
    // ДЛЯ ГОСТЕЙ НЕ ПОКАЗЫВАЕМ ИСТОРИЮ ЧАТОВ
    renderChatsList([]);
}

function renderChatsList(chats) {
    if (!chatsList) {
        console.error('❌ chatsList element not found!');
        return;
    }
    
    console.log('📋 Rendering chats:', chats);
    
    if (!chats || chats.length === 0) {
        // В гостевом режиме не показываем "Пока нет сохранённых снов"
        if (isGuestMode) {
            chatsList.innerHTML = '';
        } else {
            chatsList.innerHTML = '<div class="no-chats">Пока нет сохранённых снов</div>';
        }
        return;
    }
    
    const sortedChats = chats.sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
    const groupedChats = groupChatsByDate(sortedChats);
    
    let html = '';
    
    Object.keys(groupedChats).forEach(dateGroup => {
        // В гостевом режиме не показываем заголовки групп дат
        if (!isGuestMode) {
            html += `<div class="date-group">
                        <div class="date-group-header">${dateGroup}</div>
                        <div class="date-group-chats">`;
        } else {
            html += `<div class="date-group">
                        <div class="date-group-chats">`;
        }
        
        groupedChats[dateGroup].forEach(chat => {
            html += `<div class="chat-item ${chat.id === currentChatId ? 'active' : ''}" data-chat-id="${chat.id}">
                        <div class="chat-item-content">
                            <div class="chat-item-info">
                                <div class="chat-item-title">${chat.title || '💭 Новый сон'}</div>
                                <div class="chat-item-date">${formatChatTime(chat.last_message_at || chat.created_at)}</div>
                            </div>
                            <div class="chat-item-menu">
                                <button class="chat-menu-btn">⋮</button>
                                <div class="chat-menu-dropdown">
                                    <button class="chat-menu-item" onclick="shareChatFromList('${chat.id}')">
                                        <span class="menu-icon">📤</span>
                                        Поделиться
                                    </button>
                                    <button class="chat-menu-item delete-chat" onclick="deleteChatFromList('${chat.id}')">
                                        <span class="menu-icon">🗑️</span>
                                        Удалить
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>`;
        });
        
        html += `</div></div>`;
    });
    
    chatsList.innerHTML = html;
    setupChatItemsEventListeners();
}

function formatChatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    if (diffDays < 7) return `${diffDays} д назад`;
    
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function setupChatItemsEventListeners() {
    document.querySelectorAll('.chat-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-menu-btn') && !e.target.closest('.chat-menu-dropdown')) {
                const chatId = item.getAttribute('data-chat-id');
                console.log('💬 Opening chat:', chatId);
                openChat(chatId);
            }
        });
    });
    
    document.querySelectorAll('.chat-menu-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const dropdown = this.nextElementSibling;
            document.querySelectorAll('.chat-menu-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('active');
            });
            dropdown.classList.toggle('active');
        });
    });
}

function groupChatsByDate(chats) {
    const groups = {};
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    chats.forEach(chat => {
        const chatDate = new Date(chat.created_at);
        let groupName;
        
        if (isSameDay(chatDate, today)) {
            groupName = 'Сегодня';
        }
        else if (isSameDay(chatDate, yesterday)) {
            groupName = 'Вчера';
        }
        else if (getWeekNumber(chatDate) === getWeekNumber(today) && chatDate.getFullYear() === today.getFullYear()) {
            groupName = 'На этой неделе';
        }
        else if (chatDate.getMonth() === today.getMonth() && chatDate.getFullYear() === today.getFullYear()) {
            groupName = 'В этом месяце';
        }
        else if (chatDate.getFullYear() === today.getFullYear()) {
            groupName = chatDate.toLocaleDateString('ru-RU', { month: 'long' });
        }
        else {
            groupName = 'Ранее';
        }
        
        if (!groups[groupName]) {
            groups[groupName] = [];
        }
        groups[groupName].push(chat);
    });
    
    return groups;
}

function isSameDay(date1, date2) {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
}

function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Обновим функцию createNewChat
async function createNewChat() {
    console.log('🆕 Creating new empty chat');
    
    if (isGuestMode) {
        const chatId = 'guest-' + Date.now();
        currentChatId = chatId;
        
        if (welcomeScreen) welcomeScreen.style.display = 'none';
        if (messagesContainer) messagesContainer.style.display = 'block';
        
        if (messagesList) {
            messagesList.innerHTML = '';
            addMessageToChat('Привет! Расскажите мне о своём сне, и я помогу вам понять его значение.', 'bot');
        }
        
        console.log('✅ Empty guest chat created');
        showNotification('Новый чат создан', 'success');
        return chatId;
    }

    // Проверяем лимит чатов
    if (!checkChatLimit()) {
        return null;
    }

    try {
        const userId = localStorage.getItem('userId');
        if (!userId) {
            showNotification('Ошибка авторизации', 'error');
            return null;
        }

        const response = await makeAuthenticatedRequest(`${API_BASE}/chats/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                userId: userId, 
                firstMessage: '' // ПУСТОЕ СООБЩЕНИЕ
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            if (errorData.limit_type === 'chats') {
                showNotification(errorData.message, 'error');
                showPremiumModal();
                return null;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success) {
            console.log('✅ Empty chat created with title:', data.title);
            // Обновляем лимиты
            await loadUserLimits();
            openChat(data.chatId);
            loadUserChats();
            showNotification('Новый чат создан', 'success');
            return data.chatId;
        } else {
            throw new Error(data.error || 'Failed to create chat');
        }
        
    } catch (error) {
        console.error('❌ Create empty chat error:', error);
        
        // Проверяем не забанен ли пользователь
        if (error.message === 'Account is banned') {
            // Уже показали уведомление в makeAuthenticatedRequest
            return null;
        }
        
        showNotification('Ошибка создания чата', 'error');
        return null;
    }
}

// ИСПРАВЛЕННАЯ функция создания чата с сообщением
async function createNewChatWithMessage(initialMessage) {
    console.log('🆕 Creating new chat with message:', initialMessage);
    
    if (isGuestMode) {
        const chatId = 'guest-' + Date.now();
        currentChatId = chatId;
        
        console.log('👤 Guest mode - creating chat with message');
        
        if (welcomeScreen) welcomeScreen.style.display = 'none';
        if (messagesContainer) messagesContainer.style.display = 'block';
        
        if (messagesList) {
            messagesList.innerHTML = '';
            addMessageToChat('Привет! Расскажите мне о своём сне, и я помогу вам понять его значение.', 'bot');
        }
        
        // ДОБАВЛЯЕМ СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ В ИНТЕРФЕЙС
        addMessageToChat(initialMessage, 'user');
        
        // ОТПРАВЛЯЕМ СООБЩЕНИЕ И ПОЛУЧАЕМ ОТВЕТ
        await sendMessageToChat(chatId, initialMessage);
        
        return chatId;
    }

    const userId = localStorage.getItem('userId');
    if (!userId) {
        showNotification('Ошибка авторизации', 'error');
        return null;
    }

    try {
        console.log('🆕 Server chat creation with message:', initialMessage);
        
        const response = await makeAuthenticatedRequest(`${API_BASE}/chats/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                userId: userId, 
                firstMessage: initialMessage 
            })
        });

        console.log('📡 Server response status:', response.status);
        const data = await response.json();
        console.log('📡 Server response data:', data);
        
        if (data.success) {
            console.log('✅ Server chat created with title:', data.title);
            
            await openChat(data.chatId);
            await loadUserLimits();
            loadUserChats();
            
            // Отправляем сообщение после создания чата
            setTimeout(() => {
                sendMessageToChat(data.chatId, initialMessage);
            }, 500);
            
            return data.chatId;
        } else {
            console.log('❌ Server chat creation failed:', data.error);
            throw new Error(data.error || 'Failed to create chat');
        }
        
    } catch (error) {
        console.error('❌ Create chat with message error:', error);
        showNotification('Ошибка создания чата', 'error');
        return null;
    }
}

// Функция для ОБНОВЛЕНИЯ названия чата после отправки сообщения
function updateChatTitle(chatId, userMessage) {
    console.log('🔄 Updating chat title for:', chatId, 'with message:', userMessage);
    
    if (isGuestMode) {
        // Для гостей название не сохраняется
        console.log('🚫 Guest chat title not saved');
    } else {
        // Для авторизованных пользователей название обновляется на сервере
        console.log('🔄 Title update handled by server for authorized user');
        // Сервер сам обновит название, нам нужно только обновить список
        loadUserChats();
    }
}

async function openChat(chatId) {
    try {
        if (isGuestMode) {
            // ДЛЯ ГОСТЕЙ ВСЕГДА СОЗДАЕМ ПУСТОЙ ЧАТ
            currentChatId = chatId;
            
            if (welcomeScreen) welcomeScreen.style.display = 'none';
            if (messagesContainer) messagesContainer.style.display = 'block';
            
            if (messagesList) {
                messagesList.innerHTML = '';
                // ВСЕГДА ПОКАЗЫВАЕМ ТОЛЬКО ПРИВЕТСТВЕННОЕ СООБЩЕНИЕ
                addMessageToChat('Привет! Расскажите мне о своём сне, и я помогу вам понять его значение.', 'bot');
            }
            
            scrollToBottom();
            closeSideMenu();
            
            console.log('✅ Guest chat opened (no history)');
            return;
        }

        const response = await makeAuthenticatedRequest(`${API_BASE}/chats/${chatId}/messages`);
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                currentChatId = chatId;
                
                if (welcomeScreen) welcomeScreen.style.display = 'none';
                if (messagesContainer) messagesContainer.style.display = 'block';
                
                if (messagesList) {
                    messagesList.innerHTML = '';
                    if (data.messages && data.messages.length > 0) {
                        data.messages.forEach(msg => {
                            if (msg.user_message) {
                                addMessageToChat(msg.user_message, 'user', msg.timestamp);
                            }
                            if (msg.ai_response) {
                                addMessageToChat(msg.ai_response, 'bot', msg.timestamp);
                            }
                        });
                    } else {
                        addMessageToChat('Привет! Расскажите мне о своём сне, и я помогу вам понять его значение.', 'bot');
                    }
                }
                
                scrollToBottom();
                loadUserChats();
                closeSideMenu();
                
                console.log('✅ Chat opened successfully:', chatId);
            }
        }
    } catch (error) {
        console.error('Error opening chat:', error);
        showNotification('Ошибка загрузки чата', 'error');
    }
}

function formatResponseText(text) {
    if (!text) return '';
    
    let formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^## (.*$)/gim, '<h3>$1</h3>')
        .replace(/^### (.*$)/gim, '<h4>$1</h4>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        .replace(/\n/g, '<br>');
    
    if (formattedText.includes('<li>')) {
        formattedText = formattedText.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    }
    
    return formattedText;
}

function addMessageToChat(text, sender, timestamp = new Date().toISOString()) {
    if (!messagesList) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}`;
    
    const displayText = sender === 'bot' ? formatResponseText(text) : text;
    
    messageElement.innerHTML = `
        <div class="message-avatar">${sender === 'user' ? '👤' : '💭'}</div>
        <div class="message-content">
            <div class="message-bubble">
                <div class="message-text">${displayText}</div>
                <small class="message-time">${formatTime(timestamp)}</small>
            </div>
        </div>
    `;
    
    messagesList.appendChild(messageElement);
    scrollToBottom();
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function scrollToBottom() {
    setTimeout(() => {
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }, 100);
}

async function sendMessage() {
    if (!messageInput) return;
    
    const text = messageInput.value.trim();
    if (!text) return;
    
    if (!currentChatId) {
        await createNewChatWithMessage(text);
        return;
    }
    
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // ОБНОВЛЯЕМ НАЗВАНИЕ ЧАТА ПРИ ОТПРАВКЕ СООБЩЕНИЯ
    updateChatTitle(currentChatId, text);
    
    await sendMessageToChat(currentChatId, text);
}

function generateGuestResponse(userMessage) {
    const responses = [
        `🧠 **Анализ сна**\n\nВаш сон "${userMessage.substring(0, 30)}..." говорит о внутренних переживаниях. Это может быть связано с вашими текущими эмоциями и мыслями.\n\n**Рекомендация:** Обратите внимание на детали сна - они могут подсказать важные insights.`,
        
        `💭 **Интерпретация**\n\nСновидение о "${userMessage.substring(0, 25)}..." часто связано с подсознательными процессами. Ваш разум обрабатывает полученную за день информацию.\n\n**Вопрос:** Какие чувства вы испытывали во сне?`,
        
        `🌙 **Толкование**\n\nЭтот тип снов обычно отражает наши скрытые желания или страхи. "${userMessage.substring(0, 20)}..." может символизировать переход или изменение.\n\n**Совет:** Запишите все детали для лучшего анализа.`,
        
        `✨ **Психологический анализ**\n\nСон "${userMessage.substring(0, 25)}..." может указывать на необходимость обратить внимание на определенные аспекты жизни. Часто такие сны приходят в периоды перемен.\n\n**Рекомендация:** Поразмышляйте над символами из сна.`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
}

async function sendMessageToChat(chatId, text) {
    addMessageToChat(text, 'user');
    showTypingIndicator();
    
    try {
        // ДЛЯ ГОСТЕВОГО РЕЖИМА ТОЖЕ ИСПОЛЬЗУЕМ GIGACHAT
        if (isGuestMode) {
            // Проверяем лимит гостевых запросов
            const guestRequests = JSON.parse(localStorage.getItem('guestRequests') || '{"count": 0, "lastReset": "' + new Date().toISOString() + '"}');
            
            // Сбрасываем счетчик если прошло больше 24 часов
            const lastReset = new Date(guestRequests.lastReset);
            const now = new Date();
            if (now - lastReset > 24 * 60 * 60 * 1000) {
                guestRequests.count = 0;
                guestRequests.lastReset = now.toISOString();
            }
            
            if (guestRequests.count >= 5) {
                hideTypingIndicator();
                // УЛУЧШЕННОЕ СООБЩЕНИЕ ОБ ОШИБКЕ
                showNotification('❌ Закончились лимиты! Авторизуйтесь для безлимитного доступа', 'error');
                showAuthModal();
                return;
            }
            
            // Увеличиваем счетчик
            guestRequests.count++;
            localStorage.setItem('guestRequests', JSON.stringify(guestRequests));
            
            // ОБНОВЛЯЕМ ИНФОРМАЦИЮ О ЛИМИТАХ
            updateGuestLimits();
            
            // Показываем информацию о лимите при первом запросе
            if (guestRequests.count === 1) {
                showNotification(`Гостевой режим: 5 запросов в сутки`, 'info');
            }
            
            try {
                // Используем прямой вызов к нашему серверу для гостей
                const response = await fetch(`${API_BASE}/guest/message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        message: text,
                        chatId: chatId
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    hideTypingIndicator();
                    
                    if (data.success) {
                        addMessageToChat(data.response, 'bot');
                    } else {
                        throw new Error(data.error || 'Failed to get response');
                    }
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            } catch (error) {
                console.error('❌ Guest mode GigaChat error:', error);
                // Fallback на локальную заглушку если сервер недоступен
                hideTypingIndicator();
                const guestResponse = generateGuestResponse(text);
                addMessageToChat(guestResponse, 'bot');
            }
            return;
        }
        
        // Проверяем лимит запросов для авторизованных пользователей
        if (!checkRequestsLimit()) {
            hideTypingIndicator();
            return;
        }
        
        const response = await makeAuthenticatedRequest(`${API_BASE}/chats/${chatId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            if (errorData.limit_type === 'requests') {
                hideTypingIndicator();
                // УЛУЧШЕННОЕ СООБЩЕНИЕ ДЛЯ АВТОРИЗОВАННЫХ ПОЛЬЗОВАТЕЛЕЙ
                showNotification('❌ Закончились лимиты! Купите премиум для безлимитного доступа', 'error');
                showPremiumModal();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        hideTypingIndicator();
        
        if (data.success) {
            addMessageToChat(data.response, 'bot');
            // Обновляем лимиты
            await loadUserLimits();
            
            // ОБНОВЛЯЕМ СПИСОК ЧАТОВ ЧТОБЫ ПОДХВАТИТЬ ИЗМЕНЕННОЕ НАЗВАНИЕ
            await loadUserChats();
        } else {
            throw new Error(data.error || 'Unknown error');
        }
        
    } catch (error) {
        console.error('❌ Send message error:', error);
        hideTypingIndicator();
        const fallbackResponse = generateGuestResponse(text);
        addMessageToChat(fallbackResponse, 'bot');
    }
}

function showTypingIndicator() {
    if (!messagesList) return;
    
    const typingElement = document.createElement('div');
    typingElement.className = 'message bot';
    typingElement.id = 'typing-indicator';
    typingElement.innerHTML = `
        <div class="message-avatar">💭</div>
        <div class="message-content">
            <div class="message-bubble">
                <div class="typing-indicator">
                    <span>ИИ Сонник анализирует сон...</span>
                    <div class="typing-dots">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    messagesList.appendChild(typingElement);
    scrollToBottom();
}

function hideTypingIndicator() {
    const typingElement = document.getElementById('typing-indicator');
    if (typingElement) {
        typingElement.remove();
    }
}

async function shareChatFromList(chatId) {
    try {
        console.log('📤 Sharing chat:', chatId);
        
        if (isGuestMode) {
            showNotification('Для доступа к этой функции необходимо авторизоваться', 'error');
            showAuthModal();
            return;
        }

        const response = await makeAuthenticatedRequest(`${API_BASE}/chats/${chatId}/messages`);
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                await shareChatContent(data.messages, data.chatInfo);
            }
        }
    } catch (error) {
        console.error('Share chat error:', error);
        showNotification('Ошибка при подготовке чата для sharing', 'error');
    }
}

async function shareChatContent(messages, chatInfo) {
    let shareText = `💭 Сон: ${chatInfo.title}\n\n`;
    
    messages.forEach(msg => {
        if (msg.user_message) {
            shareText += `👤: ${msg.user_message}\n`;
        }
        if (msg.ai_response) {
            const cleanResponse = msg.ai_response.replace(/<[^>]*>/g, '');
            shareText += `🤖: ${cleanResponse}\n`;
        }
        shareText += '\n';
    });
    
    shareText += `\n---\nПоделено через ИИ Сонник`;
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: `Сон: ${chatInfo.title}`,
                text: shareText,
                url: window.location.href
            });
            showNotification('Чат успешно shared!', 'success');
        } catch (error) {
            await copyToClipboard(shareText);
        }
    } else {
        await copyToClipboard(shareText);
    }
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Текст чата скопирован в буфер обмена!', 'success');
    } catch (error) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Текст чата скопирован в буфер обмена!', 'success');
    }
}

async function deleteChatFromList(chatId) {
    if (isGuestMode) {
        showNotification('Для доступа к этой функции необходимо авторизоваться', 'error');
        showAuthModal();
        return;
    }

    const userId = localStorage.getItem('userId');
    if (!userId) return;

    try {
        const response = await makeAuthenticatedRequest(`${API_BASE}/chats/${chatId}?userId=${userId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                if (currentChatId === chatId) {
                    currentChatId = null;
                    if (welcomeScreen) welcomeScreen.style.display = 'flex';
                    if (messagesContainer) messagesContainer.style.display = 'none';
                }
                
                // Обновляем лимиты
                await loadUserLimits();
                loadUserChats();
                showNotification('Чат удалён', 'success');
            }
        }
    } catch (error) {
        console.error('Delete chat error:', error);
        showNotification('Ошибка удаления чата', 'error');
    }
}
async function logout() {
    console.log('🚪 Logging out...');
    
    if (currentSessionId) {
        try {
            await makeAuthenticatedRequest(`${API_BASE}/logout`, { method: 'POST' });
        } catch (error) {
            console.log('Logout request failed:', error);
        }
    }
    
    localStorage.clear();
    currentSessionId = null;
    userLimits = {
        is_premium: false,
        requests_used: 0,
        max_requests: 15,
        max_chats: 1,
        current_chats: 0,
        requests_remaining: 15
    };
    
    // СБРАСЫВАЕМ ИНТЕРФЕЙС ПЕРЕД ПЕРЕХОДОМ В ГОСТЕВОЙ РЕЖИМ
    currentChatId = null;
    if (welcomeScreen) welcomeScreen.style.display = 'flex';
    if (messagesContainer) messagesContainer.style.display = 'none';
    if (messagesList) messagesList.innerHTML = '';
    
    setupGuestUser();
    showNotification('Вы вышли из аккаунта', 'success');
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let icon = '✅';
    let title = 'Успешно';
    
    if (type === 'error') {
        icon = '❌';
        title = 'Ошибка';
    } else if (type === 'info') {
        icon = '💡';
        title = 'Информация';
        notification.classList.add('guest-notification');
    }
    
    notification.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
    `;
    
    if (notificationContainer) {
        notificationContainer.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 4000); // Увеличиваем время показа для ошибок
    }
}
async function checkAdminRights() {
    try {
        const response = await makeAuthenticatedRequest(`${API_BASE}/admin/check`);
        if (response.ok) {
            const data = await response.json();
            return data.success && data.is_admin;
        }
    } catch (error) {
        console.error('Error checking admin rights:', error);
    }
    return false;
}

// Функция для отображения кнопки админки в меню
async function setupAdminButton() {
    const isAdmin = await checkAdminRights();
    
    if (isAdmin) {
        // Добавляем кнопку админки в выпадающее меню пользователя
        const userMenuDropdown = document.querySelector('.user-menu-dropdown');
        if (userMenuDropdown) {
            const adminButton = document.createElement('button');
            adminButton.className = 'user-menu-item';
            adminButton.innerHTML = '<span class="menu-icon">⚙️</span> Админ панель';
            adminButton.onclick = goToAdminPanel;
            
            // Вставляем перед кнопкой выхода
            const logoutBtn = userMenuDropdown.querySelector('.user-menu-item[onclick="logout()"]');
            if (logoutBtn) {
                userMenuDropdown.insertBefore(adminButton, logoutBtn);
            } else {
                userMenuDropdown.appendChild(adminButton);
            }
        }
    }
}

// Функция перехода в админ панель
function goToAdminPanel() {
    window.location.href = 'admin.html';
}

function initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'ru-RU';
        
        recognition.onstart = function() {
            isListening = true;
            if (voiceBtn) voiceBtn.classList.add('listening');
            showNotification('Слушаю...', 'success');
        };
        
        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            if (messageInput) messageInput.value = transcript;
            isListening = false;
            if (voiceBtn) voiceBtn.classList.remove('listening');
        };
        
        recognition.onerror = function(event) {
            isListening = false;
            if (voiceBtn) voiceBtn.classList.remove('listening');
            showNotification('Ошибка распознавания речи', 'error');
        };
        
        recognition.onend = function() {
            isListening = false;
            if (voiceBtn) voiceBtn.classList.remove('listening');
        };
    }
}

function toggleVoiceRecognition() {
    if (!recognition) {
        showNotification('Голосовой ввод не поддерживается', 'error');
        return;
    }
    
    if (isListening) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

function speakLastMessage() {
    const lastBotMessage = document.querySelector('.message.bot:last-child .message-text');
    if (lastBotMessage && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(lastBotMessage.textContent);
        utterance.lang = 'ru-RU';
        utterance.rate = 0.9;
        speechSynthesis.speak(utterance);
        showNotification('Озвучиваю ответ...', 'success');
    } else {
        showNotification('Нет сообщений для озвучивания', 'error');
    }
}

// Функции меню
function toggleMenu() {
    console.log('🍔 Toggle menu clicked');
    const sidebar = document.querySelector('.sidebar');
    
    if (sidebar.classList.contains('active')) {
        closeSideMenu();
    } else {
        openSideMenu();
    }
}

function openSideMenu() {
    console.log('📖 Opening side menu');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar) {
        sidebar.classList.add('active');
        
        // Загружаем соответствующие чаты
        if (isGuestMode) {
            loadGuestChats();
        } else {
            loadUserChats();
        }
    }
    
    if (overlay) {
        overlay.classList.add('active');
    }
    
    // Блокируем скролл основного контента
    document.body.style.overflow = 'hidden';
    
    console.log('✅ Menu opened');
}

function closeSideMenu() {
    console.log('📕 Closing side menu');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar) {
        sidebar.classList.remove('active');
    }
    
    if (overlay) {
        overlay.classList.remove('active');
    }
    
    // Разблокируем скролл основного контента
    document.body.style.overflow = 'auto';
    
    console.log('✅ Menu closed');
}

function setupEventListeners() {
    console.log('🔧 Setting up event listeners');
    
    // Меню - кнопка открытия
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', toggleMenu);
        console.log('✅ Menu toggle listener added');
    }
    
    // Меню - кнопка закрытия внутри сайдбара
    const closeSidebarBtn = document.getElementById('closeSidebar');
    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', closeSideMenu);
        console.log('✅ Close sidebar listener added');
    }
    
    // Закрытие меню при клике на overlay
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
        overlay.addEventListener('click', closeSideMenu);
        console.log('✅ Overlay click listener added');
    }
    
    // Закрытие меню при клике на чат
    document.addEventListener('click', function(e) {
        if (e.target.closest('.chat-item')) {
            closeSideMenu();
        }
    });
    
    // Остальные обработчики...
    if (menuNewChat) {
        menuNewChat.addEventListener('click', createNewChat);
        console.log('✅ New chat listener added');
    }
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
        console.log('✅ Send button listener added');
    }
    
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
        
        console.log('✅ Message input listeners added');
    }
    
    // Голосовые функции
    if (voiceBtn) {
        voiceBtn.addEventListener('click', toggleVoiceRecognition);
        console.log('✅ Voice button listener added');
    }
    
    if (ttsBtn) {
        ttsBtn.addEventListener('click', speakLastMessage);
        console.log('✅ TTS button listener added');
    }
    
    // Быстрые действия с русским текстом
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            let prompt = '';
            const buttonText = e.target.textContent.trim();
            
            switch(buttonText) {
                case '💭 Новый чат':
                    prompt = '';
                    await createNewChat();
                    break;
                case '🏃‍♂️ Мне снилась погоня':
                    prompt = 'Мне снилось, что за мной кто-то гнался';
                    break;
                case '🌊 Мне снилось море':
                    prompt = 'Мне снилась вода, море или океан';
                    break;
                case '🦷 Мне снились зубы':
                    prompt = 'Мне снились зубы, они выпадали или болели';
                    break;
                default:
                    prompt = '';
            }
            
            if (prompt) {
                await createNewChatWithMessage(prompt);
            }
        });
    });
    
    console.log('✅ Quick actions listeners added');
    
    // Меню пользователя (три точки рядом с аватаром) - только для авторизованных
    if (!isGuestMode) {
        const userMenuBtn = document.querySelector('.user-menu-btn');
        if (userMenuBtn) {
            userMenuBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const dropdown = this.nextElementSibling;
                document.querySelectorAll('.user-menu-dropdown').forEach(d => {
                    if (d !== dropdown) d.classList.remove('active');
                });
                dropdown.classList.toggle('active');
            });
            console.log('✅ User menu listener added');
        }
    }
    
    // Обработчики для меню чатов
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.chat-menu-btn') && !e.target.closest('.chat-menu-dropdown')) {
            document.querySelectorAll('.chat-menu-dropdown').forEach(d => {
                d.classList.remove('active');
            });
        }
        
        if (!e.target.closest('.user-menu-btn') && !e.target.closest('.user-menu-dropdown')) {
            document.querySelectorAll('.user-menu-dropdown').forEach(d => {
                d.classList.remove('active');
            });
        }
    });
    
    console.log('✅ Dropdown listeners added');
    
    // Закрытие модальных окон
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                hideModal();
            }
        });
    }
    
    console.log('🎉 All event listeners setup complete');
}

document.addEventListener('DOMContentLoaded', function() {
    initApp();
});