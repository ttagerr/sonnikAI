const API_BASE = 'http://localhost:3000/api';
let currentSessionId = localStorage.getItem('sessionId');
let allUsers = []; // Все пользователи
let currentPage = 1;
const usersPerPage = 10;

// DOM элементы
const adminStats = document.getElementById('adminStats');
const usersTableBody = document.getElementById('usersTableBody');
const usersLoading = document.getElementById('usersLoading');
const userSearch = document.getElementById('userSearch');

// Основные функции
async function initAdminPanel() {
    console.log('🚀 INIT ADMIN PANEL');
     initResponsiveAdmin();
    // Проверяем авторизацию
    if (!currentSessionId) {
        showNotification('Требуется авторизация', 'error');
        setTimeout(() => goToMainApp(), 2000);
        return;
    }

    // Проверяем права администратора
    const isAdmin = await checkAdminRights();
    console.log('🔐 Admin rights check:', isAdmin);
    
    if (!isAdmin) {
        showNotification('Доступ запрещен. Недостаточно прав.', 'error');
        setTimeout(() => goToMainApp(), 2000);
        return;
    }

    // Загружаем данные последовательно
    console.log('📥 Loading admin data...');
    
    // Сначала статистика
    await loadAdminStats();
    console.log('📊 Stats loaded');
    
    // Затем пользователи
    await loadUsers();
    console.log('👥 Users loaded');

    // Настраиваем поиск
    if (userSearch) {
        userSearch.addEventListener('input', debounce(handleSearch, 300));
    }

    console.log('✅ Admin panel initialized');
}

// Проверка прав администратора
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

// Показать/скрыть загрузку статистики
function showStatsLoading(show) {
    console.log('📊 Show stats loading:', show);
    
    const statsElements = [
        'totalUsers', 'totalPremium', 'totalBanned', 'totalChats', 'totalMessages'
    ];
    
    statsElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            if (show) {
                element.textContent = '...';
                element.style.color = '#8b9ccf';
            } else {
                element.style.color = '#44a3ff';
            }
        }
    });
}

// Загрузка статистики
async function loadAdminStats() {
    try {
        console.log('📊 Loading admin stats...');
        showStatsLoading(true);
        
        const response = await makeAuthenticatedRequest(`${API_BASE}/admin/stats`);
        
        if (response.ok) {
            const data = await response.json();
            console.log('📊 Full admin stats response:', data);
            
            if (data.success && data.stats) {
                console.log('📊 Stats object:', data.stats);
                console.log('📊 Individual values:');
                console.log('  - total_users:', data.stats.total_users);
                console.log('  - total_premium:', data.stats.total_premium);
                console.log('  - total_banned:', data.stats.total_banned);
                console.log('  - total_chats:', data.stats.total_chats);
                console.log('  - total_messages:', data.stats.total_messages);
                
                updateStatsDisplay(data.stats);
            } else {
                console.error('❌ Stats loading failed:', data.error);
                showNotification('Ошибка загрузки статистики', 'error');
            }
        } else if (response.status === 403) {
            showNotification('Доступ запрещен. Недостаточно прав.', 'error');
            setTimeout(() => goToMainApp(), 2000);
        } else {
            console.error('❌ Stats loading HTTP error:', response.status);
            showNotification('Ошибка загрузки статистики: ' + response.status, 'error');
        }
    } catch (error) {
        console.error('❌ Error loading admin stats:', error);
        showNotification('Ошибка загрузки статистики', 'error');
    } finally {
        showStatsLoading(false);
    }
}

// Обновление отображения статистики
function updateStatsDisplay(stats) {
    console.log('📊 Updating stats display with:', stats);
    
    // Простая прямая установка значений
    const setStatValue = (elementId, value) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value !== undefined ? value : 0;
            console.log(`✅ Set ${elementId} to ${value}`);
        } else {
            console.log(`❌ Element not found: ${elementId}`);
        }
    };
    
    setStatValue('totalUsers', stats.total_users);
    setStatValue('totalPremium', stats.total_premium);
    setStatValue('totalBanned', stats.total_banned);
    setStatValue('totalChats', stats.total_chats);
    setStatValue('totalMessages', stats.total_messages);
}

// Показать/скрыть загрузку пользователей
function showUsersLoading(show) {
    const usersTableBody = document.getElementById('usersTableBody');
    const usersLoading = document.getElementById('usersLoading');
    
    if (usersLoading) {
        usersLoading.style.display = show ? 'flex' : 'none';
    }
    if (usersTableBody) {
        usersTableBody.style.display = show ? 'none' : '';
    }
}

// Загрузка пользователей
async function loadUsers() {
    try {
        console.log('👥 Loading users...');
        showUsersLoading(true);
        
        const response = await makeAuthenticatedRequest(`${API_BASE}/admin/users`);
        console.log('👥 Users response status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('👥 Users response data:', data);
            
            if (data.success) {
                allUsers = data.users || [];
                console.log(`👥 Found ${allUsers.length} users total`);
                currentPage = 1; // Сбрасываем на первую страницу
                renderUsersTable();
                createPagination(); // Создаем пагинацию
            } else {
                console.error('👥 Users loading failed:', data.error);
                showNotification('Ошибка загрузки пользователей: ' + (data.error || 'Неизвестная ошибка'), 'error');
            }
        } else if (response.status === 403) {
            console.error('👥 Access denied');
            showNotification('Доступ запрещен. Недостаточно прав.', 'error');
            setTimeout(() => goToMainApp(), 2000);
        } else {
            const errorText = await response.text();
            console.error('👥 Users loading error:', response.status, errorText);
            showNotification('Ошибка загрузки пользователей: ' + response.status, 'error');
        }
    } catch (error) {
        console.error('👥 Error loading users:', error);
        showNotification('Ошибка загрузки пользователей: ' + error.message, 'error');
    } finally {
        showUsersLoading(false);
    }
}

// Отображение таблицы пользователей (только текущая страница)
function renderUsersTable() {
    console.log('👥 Rendering users table, page:', currentPage);
    
    if (!usersTableBody) {
        console.error('👥 usersTableBody element not found!');
        return;
    }

    // Получаем пользователей для текущей страницы
    const startIndex = (currentPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const usersToShow = allUsers.slice(startIndex, endIndex);

    console.log(`👥 Showing users ${startIndex + 1}-${endIndex} of ${allUsers.length}`);

    if (usersToShow.length === 0) {
        usersTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="no-data">Пользователи не найдены</td>
            </tr>
        `;
        return;
    }

    const deviceType = getDeviceType();
    let html = '';
    
    usersToShow.forEach((user, index) => {
        const globalIndex = startIndex + index;
        const registerDate = new Date(user.created_at).toLocaleDateString('ru-RU');
        const isPremium = user.is_premium === 1;
        const isBanned = user.is_banned === 1;

        // Адаптивное отображение в зависимости от устройства
        let displayHtml = '';
        
        if (deviceType === 'mobile') {
            // Компактный вид для мобильных
            displayHtml = `
                <tr data-user-id="${user.id}" class="compact-view">
                    <td class="user-id">${globalIndex + 1}</td>
                    <td class="user-phone">${user.phone || 'Не указан'}</td>
                    <td class="user-name">${user.name || 'Не указано'}</td>
                    <td class="user-date">${registerDate}</td>
                    <td class="user-status">
                        <span class="status-badge ${isPremium ? 'premium' : ''} ${isBanned ? 'banned' : ''}">
                            ${isBanned ? '🚫' : (isPremium ? '💎' : '👤')}
                        </span>
                    </td>
                    <td class="user-actions">
                        <button class="action-btn ${isPremium ? 'active' : ''}" onclick="toggleUserPremium('${user.id}', ${isPremium})" title="${isPremium ? 'Отключить премиум' : 'Включить премиум'}">
                            💎
                        </button>
                        <button class="action-btn ${isBanned ? 'active' : ''}" onclick="toggleUserBan('${user.id}', ${isBanned})" title="${isBanned ? 'Разблокировать' : 'Заблокировать'}">
                            ${isBanned ? '🔓' : '🚫'}
                        </button>
                    </td>
                </tr>
            `;
        } else {
            // Полный вид для десктопов
            displayHtml = `
                <tr data-user-id="${user.id}">
                    <td class="user-id">${globalIndex + 1}</td>
                    <td class="user-phone">${user.phone || 'Не указан'}</td>
                    <td class="user-name">${user.name || 'Не указано'}</td>
                    <td class="user-email">${user.email || 'Не указан'}</td>
                    <td class="user-date">${registerDate}</td>
                    <td class="user-chats">${user.chat_count || 0}</td>
                    <td class="user-messages">${user.message_count || 0}</td>
                    <td class="user-status">
                        <span class="status-badge ${isPremium ? 'premium' : ''} ${isBanned ? 'banned' : ''}">
                            ${isBanned ? '🚫 Заблокирован' : (isPremium ? '💎 Премиум' : '👤 Обычный')}
                        </span>
                    </td>
                    <td class="user-actions">
                        <button class="action-btn ${isPremium ? 'active' : ''}" onclick="toggleUserPremium('${user.id}', ${isPremium})" title="${isPremium ? 'Отключить премиум' : 'Включить премиум'}">
                            💎
                        </button>
                        <button class="action-btn ${isBanned ? 'active' : ''}" onclick="toggleUserBan('${user.id}', ${isBanned})" title="${isBanned ? 'Разблокировать' : 'Заблокировать'}">
                            ${isBanned ? '🔓' : '🚫'}
                        </button>
                    </td>
                </tr>
            `;
        }
        
        html += displayHtml;
    });

    usersTableBody.innerHTML = html;
    console.log('👥 Users table rendered successfully for device:', deviceType);
}
function initResponsiveAdmin() {
    applyResponsiveClasses();
    window.addEventListener('resize', debounce(() => {
        applyResponsiveClasses();
        renderUsersTable(); // Перерисовываем таблицу при изменении размера
    }, 250));
}


// Создание пагинации
function createPagination() {
    const totalPages = Math.ceil(allUsers.length / usersPerPage);
    
    if (totalPages <= 1) {
        // Удаляем существующую пагинацию если есть
        const existingPagination = document.getElementById('paginationContainer');
        if (existingPagination) {
            existingPagination.remove();
        }
        return;
    }

    // Находим или создаем контейнер для пагинации
    let paginationContainer = document.getElementById('paginationContainer');
    
    if (!paginationContainer) {
        // Создаем контейнер для пагинации
        const adminSection = document.querySelector('.admin-section');
        if (adminSection) {
            paginationContainer = document.createElement('div');
            paginationContainer.className = 'pagination';
            paginationContainer.id = 'paginationContainer';
            adminSection.appendChild(paginationContainer);
        } else {
            console.error('👥 Admin section not found for pagination');
            return;
        }
    }

    let html = '<div class="pagination-controls">';
    
    // Кнопка "Назад"
    if (currentPage > 1) {
        html += `<button class="pagination-btn" onclick="changePage(${currentPage - 1})">‹ Назад</button>`;
    }
    
    // Номера страниц
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }
    
    // Кнопка "Вперед"
    if (currentPage < totalPages) {
        html += `<button class="pagination-btn" onclick="changePage(${currentPage + 1})">Вперед ›</button>`;
    }
    
    html += `</div><div class="pagination-info">Страница ${currentPage} из ${totalPages} (всего: ${allUsers.length} пользователей)</div>`;
    
    paginationContainer.innerHTML = html;
    console.log('👥 Pagination created successfully');
}

// Смена страницы
function changePage(page) {
    if (page < 1 || page > Math.ceil(allUsers.length / usersPerPage)) return;
    
    currentPage = page;
    renderUsersTable();
    createPagination();
    
    // Прокрутка к верху таблицы
    const tableContainer = document.querySelector('.users-table-container');
    if (tableContainer) {
        tableContainer.scrollIntoView({ behavior: 'smooth' });
    }
}

// Поиск пользователей
function handleSearch() {
    const searchTerm = userSearch.value.toLowerCase().trim();
    
    if (searchTerm === '') {
        // Если поиск пустой, показываем всех пользователей
        currentPage = 1;
        renderUsersTable();
        createPagination();
        return;
    }
    
    // Фильтруем пользователей по поисковому запросу
    const filteredUsers = allUsers.filter(user => {
        const userName = (user.name || '').toLowerCase();
        const userPhone = (user.phone || '').toLowerCase();
        const userEmail = (user.email || '').toLowerCase();
        
        return userName.includes(searchTerm) || 
               userPhone.includes(searchTerm) || 
               userEmail.includes(searchTerm);
    });
    
    // Временно заменяем allUsers на отфильтрованных
    const originalUsers = allUsers;
    allUsers = filteredUsers;
    currentPage = 1;
    
    renderUsersTable();
    createPagination();
    
    // Восстанавливаем оригинальный массив
    allUsers = originalUsers;
    
    console.log(`🔍 Found ${filteredUsers.length} users matching "${searchTerm}"`);
}

// Переключение премиум статуса
async function toggleUserPremium(userId, currentStatus) {
    if (!confirm(`Вы уверены, что хотите ${currentStatus ? 'отключить' : 'включить'} премиум для этого пользователя?`)) {
        return;
    }

    try {
        const response = await makeAuthenticatedRequest(`${API_BASE}/admin/user/${userId}/toggle-premium`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showNotification(`Премиум статус ${data.is_premium ? 'включен' : 'отключен'}`, 'success');
                await loadUsers(); // Обновляем список
                await loadAdminStats(); // Обновляем статистику
            }
        } else {
            throw new Error('Failed to toggle premium');
        }
    } catch (error) {
        console.error('Error toggling user premium:', error);
        showNotification('Ошибка изменения премиум статуса', 'error');
    }
}

// Переключение бана пользователя
async function toggleUserBan(userId, currentStatus) {
    const action = currentStatus ? 'разблокировать' : 'заблокировать';
    if (!confirm(`Вы уверены, что хотите ${action} этого пользователя?`)) {
        return;
    }

    try {
        const response = await makeAuthenticatedRequest(`${API_BASE}/admin/user/${userId}/toggle-ban`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showNotification(`Пользователь ${data.is_banned ? 'заблокирован' : 'разблокирован'}`, 'success');
                await loadUsers(); // Обновляем список
                await loadAdminStats(); // Обновляем статистику
            }
        } else {
            throw new Error('Failed to toggle ban');
        }
    } catch (error) {
        console.error('Error toggling user ban:', error);
        showNotification('Ошибка изменения статуса блокировки', 'error');
    }
}

// Вспомогательные функции
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function makeAuthenticatedRequest(url, options = {}) {
    const sessionId = currentSessionId;
    if (sessionId) {
        if (!options.headers) options.headers = {};
        options.headers['Authorization'] = sessionId;
    }
    return fetch(url, options);
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
    }
    
    notification.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
    `;
    
    const container = document.getElementById('notificationContainer');
    if (container) {
        container.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }
}

function refreshAdminData() {
    loadAdminStats();
    loadUsers();
    showNotification('Данные обновлены', 'success');
}

function goToMainApp() {
    window.location.href = 'index.html';
}
function getDeviceType() {
    const width = window.innerWidth;
    if (width <= 480) return 'mobile';
    if (width <= 768) return 'tablet';
    if (width <= 1200) return 'small-desktop';
    return 'desktop';
}
// Функция применения адаптивных классов
function applyResponsiveClasses() {
    const deviceType = getDeviceType();
    const body = document.body;
    
    // Удаляем предыдущие классы
    body.classList.remove('mobile-admin-view', 'tablet-admin-view', 'small-desktop-view', 'desktop-view');
    
    // Добавляем соответствующий класс
    switch(deviceType) {
        case 'mobile':
            body.classList.add('mobile-admin-view', 'compact-view');
            break;
        case 'tablet':
            body.classList.add('tablet-admin-view', 'compact-view');
            break;
        case 'small-desktop':
            body.classList.add('small-desktop-view');
            break;
        default:
            body.classList.add('desktop-view');
    }
    
    console.log(`📱 Device type: ${deviceType}`);
}
function logout() {
    localStorage.clear();
    goToMainApp();
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', initAdminPanel);