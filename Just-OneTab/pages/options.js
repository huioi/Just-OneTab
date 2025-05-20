// pages/options.js

document.addEventListener('DOMContentLoaded', () => {
    // 设置项配置：键名、类型、元素选择器（ID 或 radio 的 name 属性）
    // 这种方式使得添加/管理设置更加声明式。
    const settingsConfig = [
        { key: 'themePreference', type: 'radio', name: 'themePreference' }, // 主题偏好
        { key: 'hoverToShowSettingsIcon', type: 'checkbox', id: 'hoverToShowSettingsIcon' }, // 悬停显示设置图标
        { key: 'enableDragAndDrop', type: 'checkbox', id: 'enableDragAndDrop' }, // 启用拖放功能
        { key: 'iconAction', type: 'radio', name: 'iconAction' }, // 插件图标默认行为
        { key: 'searchGroupTitles', type: 'checkbox', id: 'searchGroupTitles' }, // 搜索包含组标题
        { key: 'searchTabURLs', type: 'checkbox', id: 'searchTabURLs' }, // 搜索包含标签页URL
        { key: 'showHeaderSearch', type: 'checkbox', id: 'showHeaderSearch' }, // 主页头部显示搜索框
        { key: 'showHeaderOpenAll', type: 'checkbox', id: 'showHeaderOpenAll' }, // 主页头部显示“全部打开”
        { key: 'showHeaderDeleteAll', type: 'checkbox', id: 'showHeaderDeleteAll' }, // 主页头部显示“全部删除”
        { key: 'showHeaderExport', type: 'checkbox', id: 'showHeaderExport' }, // 主页头部显示“导出”
        { key: 'showHeaderImport', type: 'checkbox', id: 'showHeaderImport' }, // 主页头部显示“导入”
        { key: 'showGroupOpenButton', type: 'checkbox', id: 'showGroupOpenButton' }, // 标签组显示“打开组”按钮
        { key: 'showGroupDeleteButton', type: 'checkbox', id: 'showGroupDeleteButton' }, // 标签组显示“删除组”按钮
        { key: 'showGroupExportButton', type: 'checkbox', id: 'showGroupExportButton' }, // 标签组显示“导出”按钮
    ];

    // DOM 元素引用
    const saveButton = document.getElementById('saveSettings');
    const restoreDefaultButton = document.getElementById('restoreDefaultSettings');
    const statusMessage = document.getElementById('statusMessage'); // 用于显示保存状态等消息
    const settingsFormContainer = document.getElementById('settingsFormContainer'); // 设置表单的容器

    // 默认设置值
    const defaultSettings = {
        themePreference: 'system',
        hoverToShowSettingsIcon: true,
        enableDragAndDrop: true,
        iconAction: 'saveAllInWindow',
        searchGroupTitles: true,
        searchTabURLs: true,
        showHeaderSearch: true,
        showHeaderOpenAll: true,
        showHeaderDeleteAll: true,
        showHeaderExport: true,
        showHeaderImport: true,
        showGroupOpenButton: true,
        showGroupDeleteButton: true,
        showGroupExportButton: true,
    };

    // 用于检测系统深色模式的媒体查询
    let systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

    /**
     * 将选定的主题（浅色/深色/跟随系统）应用到选项页面的 body 元素。
     * @param {string} themePref - 主题偏好设置 ('light', 'dark', 或 'system')。
     */
    function applyThemeToOptionsPage(themePref) {
        const isDark = themePref === 'system' ? systemThemeQuery.matches : themePref === 'dark';
        document.body.classList.toggle('dark-mode', isDark);
    }

    /**
     * 处理系统首选颜色方案的变化。
     * 如果当前主题设置为“跟随系统”，则根据系统变化更新页面主题。
     */
    function handleSystemThemeChange() {
        chrome.storage.sync.get({ themePreference: defaultSettings.themePreference }, (settings) => {
            if (settings.themePreference === 'system') {
                applyThemeToOptionsPage('system');
            }
        });
    }

    /**
     * 将设置加载到表单元素中。
     * @param {object} settingsToLoad - 需要加载的设置对象。
     */
    function loadSettings(settingsToLoad = defaultSettings) {
        applyThemeToOptionsPage(settingsToLoad.themePreference); // 首先应用主题

        // 遍历配置，为每个设置项更新对应的表单控件
        settingsConfig.forEach(config => {
            const value = settingsToLoad[config.key];
            if (config.type === 'checkbox') {
                const el = document.getElementById(config.id);
                if (el) el.checked = value;
            } else if (config.type === 'radio') {
                document.querySelectorAll(`input[name="${config.name}"]`).forEach(radio => {
                    if (radio.value === value) radio.checked = true;
                });
            }
        });

        // 管理系统主题变化监听器：如果设置为“跟随系统”，则添加监听器，否则移除。
        systemThemeQuery.removeEventListener('change', handleSystemThemeChange);
        if (settingsToLoad.themePreference === 'system') {
            systemThemeQuery.addEventListener('change', handleSystemThemeChange);
        }
    }

    /**
     * 从存储中获取设置并加载到表单中。
     */
    function fetchAndLoadInitialSettings() {
        chrome.storage.sync.get(defaultSettings, (settings) => {
            loadSettings(settings);
        });
    }

    /**
     * 将表单中的当前设置保存到 chrome.storage.sync。
     */
    function saveSettings() {
        if (!saveButton) return; // 如果保存按钮不存在，则不执行任何操作

        const newSettings = {};
        // 遍历配置，从表单控件中读取设置值
        settingsConfig.forEach(config => {
            if (config.type === 'checkbox') {
                const el = document.getElementById(config.id);
                newSettings[config.key] = el?.checked ?? defaultSettings[config.key]; // 使用可选链和空值合并操作符确保安全
            } else if (config.type === 'radio') {
                const radios = document.querySelectorAll(`input[name="${config.name}"]`);
                const checkedRadio = Array.from(radios).find(radio => radio.checked);
                newSettings[config.key] = checkedRadio ? checkedRadio.value : defaultSettings[config.key];
            }
        });

        chrome.storage.sync.set(newSettings, () => {
            if (chrome.runtime.lastError) {
                statusMessage.textContent = '保存设置失败: ' + chrome.runtime.lastError.message;
                statusMessage.className = 'status-message error';
            } else {
                statusMessage.textContent = '设置已保存！';
                statusMessage.className = 'status-message success';
                applyThemeToOptionsPage(newSettings.themePreference); // 保存后立即应用主题

                // 根据新的主题设置更新系统主题变化监听器
                systemThemeQuery.removeEventListener('change', handleSystemThemeChange);
                if (newSettings.themePreference === 'system') {
                    systemThemeQuery.addEventListener('change', handleSystemThemeChange);
                }

                // 通知扩展的其他部分（例如管理页面）设置已更新
                chrome.runtime.sendMessage({ action: "settingsUpdated", settings: newSettings }, response => {
                    if (chrome.runtime.lastError) {
                        // console.warn("向管理页面发送设置更新消息失败:", chrome.runtime.lastError.message);
                    }
                });
            }
            // 3秒后清除状态消息
            setTimeout(() => {
                statusMessage.textContent = '';
                statusMessage.className = 'status-message';
            }, 3000);
        });
    }

    /**
     * 处理将设置恢复为默认值的操作。
     * 将默认值加载到表单中，并显示提示消息。
     */
    async function handleRestoreDefaults() {
        loadSettings(defaultSettings); // 将默认设置加载到UI
        applyThemeToOptionsPage(defaultSettings.themePreference); // 立即应用主题

        // 更新系统主题变化监听器
        systemThemeQuery.removeEventListener('change', handleSystemThemeChange);
        if (defaultSettings.themePreference === 'system') {
            systemThemeQuery.addEventListener('change', handleSystemThemeChange);
        }

        statusMessage.textContent = '默认设置已加载，请点击“保存设置”以应用。';
        statusMessage.className = 'status-message info';
        // 4秒后清除状态消息
        setTimeout(() => {
            statusMessage.textContent = '';
            statusMessage.className = 'status-message';
        }, 4000);
    }

    // 事件监听器绑定
    if (saveButton) saveButton.addEventListener('click', saveSettings);
    if (restoreDefaultButton) restoreDefaultButton.addEventListener('click', handleRestoreDefaults);

    // 主题单选按钮变化监听器
    document.querySelectorAll('input[name="themePreference"]').forEach(radio => {
        radio.addEventListener('change', (event) => {
            if (event.target.checked) {
                applyThemeToOptionsPage(event.target.value); // 应用选择的主题
                // 相应地更新系统主题变化监听器
                systemThemeQuery.removeEventListener('change', handleSystemThemeChange);
                if (event.target.value === 'system') {
                    systemThemeQuery.addEventListener('change', handleSystemThemeChange);
                }
            }
        });
    });

    // 允许通过回车键保存设置，除非焦点在文本区域或其他按钮上
    if (settingsFormContainer) {
        settingsFormContainer.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                const activeElement = document.activeElement;
                // 如果焦点在文本区域或非“保存”按钮上，则不触发保存
                if (activeElement && (
                    activeElement.tagName === 'TEXTAREA' ||
                    (activeElement.tagName === 'BUTTON' && activeElement !== saveButton)
                )) {
                    return;
                }
                event.preventDefault(); // 阻止表单默认提交行为
                saveSettings();
            }
        });
    }

    // 页面加载完成后，获取并加载初始设置
    fetchAndLoadInitialSettings();
});