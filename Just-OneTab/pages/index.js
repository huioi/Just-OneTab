// pages/index.js

document.addEventListener("DOMContentLoaded", async () => {
    // 全局变量，用于缓存标签组数据、同步状态、拖放信息和当前设置
    let groupsCache = []; // 缓存从存储中加载的标签组数据
    let syncTimeout; // 用于防抖同步操作的定时器ID
    let isSyncing = false; // 标记是否正在进行同步操作，防止并发冲突
    let draggedItemInfo = null; // 存储当前被拖动项的信息（标签页或组）
    let currentSettings = {}; // 缓存从存储中加载的用户设置

    // DOM元素集中访问器，使用 getter 按需获取并缓存元素引用
    const DOMElements = {
        _cache: {}, // 缓存已获取的DOM元素
        getElement(id) {
            if (!this._cache[id]) {
                this._cache[id] = document.getElementById(id);
            }
            return this._cache[id];
        },
        get fileInput() { return this.getElement("fileInput"); }, // 文件输入框，用于导入JSON/HTML
        get markdownImportModal() { return this.getElement("markdownImportModal"); }, // Markdown导入模态框
        get markdownPasteArea() { return this.getElement("markdownPasteArea"); }, // Markdown粘贴区域
        get confirmMdImportBtn() { return this.getElement("confirmMarkdownImport"); }, // 确认Markdown导入按钮
        get cancelMdImportBtn() { return this.getElement("cancelMarkdownImport"); }, // 取消Markdown导入按钮
        get genericModal() { return this.getElement("genericModal-just-onetab"); }, // 通用模态框（提示、确认）
        get genericModalTitle() { return this.getElement("genericModalTitle"); }, // 通用模态框标题
        get genericModalTextarea() { return this.getElement("genericModalTextarea"); }, // 通用模态框文本区域（只读）
        get genericModalButtons() { return this.getElement("genericModalButtons"); }, // 通用模态框按钮容器
        get settingsGearBtn() { return this.getElement("settings-gear-btn"); }, // 右下角设置齿轮按钮
        get settingsModalContainer() { return this.getElement("settingsModalContainer"); }, // 设置模态框容器
        get settingsModalContent() { return this.getElement("settingsModalContent"); }, // 设置模态框内容区域
        get saveSettingsInModalBtn() { return this.getElement("saveSettingsInModal"); }, // 设置模态框中的保存按钮
        get closeSettingsModalBtn() { return this.getElement("closeSettingsModal"); }, // 设置模态框中的关闭按钮
        get settingsModalDialog() { return this.getElement("settingsModalDialog"); }, // 设置模态框对话框本身
        get settingsHoverArea() { return this.getElement("settings-hover-area"); }, // 设置图标的悬停触发区域
        get searchBoxContainer() { return this.getElement('search-box-container'); }, // 搜索框容器
        get openAllButton() { return this.getElement('open-all'); }, // “全部打开”按钮
        get deleteAllButton() { return this.getElement('delete-all'); }, // “全部删除”按钮
        get exportAllDropdownContainer() { return this.getElement('export-all-dropdown-container'); }, // “导出全部”下拉菜单容器
        get importAllDropdownContainer() { return this.getElement('import-all-dropdown-container'); }, // “导入”下拉菜单容器
        get searchInput() { return this.getElement("searchInput"); }, // 搜索输入框
        get groupsContainer() { return this.getElement("groups-container"); }, // 标签组列表的容器
        get tabCount() { return this.getElement("tab-count"); }, // 显示总标签页数量的元素
        get exportAllMainBtn() { return this.getElement("export-all-main-btn"); }, // “导出全部”主按钮
        get exportAllOptionsMenu() { return this.getElement("export-all-options-menu"); }, // “导出全部”下拉选项菜单
        get exportAllMdItem() { return this.getElement("export-all-md-item"); }, // 导出全部为Markdown选项
        get exportAllJsonItem() { return this.getElement("export-all-json-item"); }, // 导出全部为JSON选项
        get exportAllHtmlItem() { return this.getElement("export-all-html-item"); }, // 导出全部为HTML选项
        get importMainBtn() { return this.getElement("import-main-btn"); }, // “导入”主按钮
        get importOptionsMenu() { return this.getElement("import-options-menu"); }, // “导入”下拉选项菜单
        get importMdItem() { return this.getElement("import-md-item"); }, // 从Markdown导入选项
        get importJsonItem() { return this.getElement("import-json-item"); }, // 从JSON导入选项
        get importHtmlItem() { return this.getElement("import-html-item"); }, // 从HTML导入选项
    };

    // 默认设置，用于初始化或恢复
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

    // ====== 辅助函数 ======

    /**
     * 防抖函数：在指定延迟后执行函数，如果在延迟内再次触发，则重置定时器。
     * @param {Function} fn - 需要防抖处理的函数。
     * @param {number} [delay=300] - 延迟时间（毫秒）。
     * @returns {Function} 经过防抖处理的函数。
     */
    const debounce = (fn, delay = 300) => {
        let timer;
        return function (...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
    };

    /**
     * 转义HTML特殊字符。
     * @param {string} str - 需要转义的字符串。
     * @returns {string} 转义后的字符串。
     */
    const escapeHTML = (str) => {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match]));
    };

    /**
     * 在文本中高亮显示指定的关键词。
     * @param {string} text - 原始文本。
     * @param {string} keyword - 需要高亮的关键词。
     * @returns {string} 包含高亮HTML标签的文本。
     */
    const highlightText = (text, keyword) => {
        const safeText = escapeHTML(text || "");
        if (!keyword || typeof safeText !== 'string') return safeText; // 如果没有关键词或文本无效，则返回原文本
        const escapedKeyword = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // 转义关键词中的正则表达式特殊字符
        const regex = new RegExp(`(${escapedKeyword})`, "gi"); // 创建不区分大小写的全局匹配正则表达式
        return safeText.replace(regex, `<span class="highlight">$1</span>`); // 替换匹配项为高亮标签
    };

    /**
     * 获取格式化的当前日期和时间字符串，用于文件名。
     * @returns {string} 格式如 "YYYYMMDD_HHMMSS" 的字符串。
     */
    const getFormattedDateTime = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        return `${year}${month}${day}_${hours}${minutes}${seconds}`;
    };

    // ====== 设置管理 ======

    // 用于检测系统深色模式的媒体查询对象
    let systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

    /**
     * 应用当前主题设置到页面。
     * 根据 currentSettings.themePreference (light, dark, system) 调整 body 的 classList。
     */
    function applyCurrentTheme() {
        if (!currentSettings || typeof currentSettings.themePreference === 'undefined') {
            // 如果设置未加载，则默认跟随系统
            document.body.classList.toggle('dark-mode', systemThemeQuery.matches);
            return;
        }
        const applyDark = currentSettings.themePreference === 'system' ? systemThemeQuery.matches : currentSettings.themePreference === 'dark';
        document.body.classList.toggle('dark-mode', applyDark);
    }

    /**
     * 处理系统主题变化事件。
     * 如果当前设置是“跟随系统”，则调用 applyCurrentTheme 更新页面主题。
     */
    function handleSystemThemeChangeForMainPage() {
        if (currentSettings?.themePreference === 'system') {
            applyCurrentTheme();
        }
    }

    /**
     * 根据设置应用右下角设置图标的可见性行为（悬停显示或常驻）。
     * @param {boolean} showOnHover - 是否配置为悬停时显示。
     */
    function applySettingsIconVisibility(showOnHover) {
        const { settingsGearBtn, settingsHoverArea } = DOMElements;
        if (!settingsGearBtn || !settingsHoverArea) return;
        document.body.classList.toggle('settings-icon-hover-enabled', showOnHover);
        settingsGearBtn.classList.toggle('always-visible', !showOnHover);
    }

    /**
     * 根据设置启用或禁用拖放功能。
     * @param {boolean} isEnabled - 是否启用拖放。
     */
    function applyDragAndDropSetting(isEnabled) {
        DOMElements.groupsContainer?.classList.toggle('drag-interactions-disabled', !isEnabled);
        renderGroups(); // 重新渲染以应用 draggable 属性
    }

    /**
     * 恢复所有设置为默认值。
     * @param {boolean} [fromModal=false] - 是否从设置模态框中调用此函数。
     */
    async function restoreDefaultSettings(fromModal = false) {
        const { settingsModalContainer, genericModal } = DOMElements;
        // 确保通用模态框在设置模态框之上
        if (genericModal && settingsModalContainer) {
            const settingsZIndex = parseInt(window.getComputedStyle(settingsModalContainer).zIndex, 10) || 1600;
            genericModal.style.zIndex = (settingsZIndex + 1).toString();
        }

        showGenericModal({
            title: "恢复默认设置",
            content: "确定要恢复所有设置为默认值吗？",
            buttons: [
                {
                    text: '确认恢复',
                    class: 'btn-danger', // 危险操作按钮样式
                    action: async () => {
                        currentSettings = { ...defaultSettings }; // 更新内存中的当前设置
                        await chrome.storage.sync.set({ ...defaultSettings }); // 保存到存储
                        showToast("设置已恢复为默认值！", "success");
                        applyAllSettingsToUI(); // 应用所有UI相关的设置

                        if (fromModal && settingsModalContainer.classList.contains('show')) {
                            // 如果是从设置模态框调用的，重新加载模态框内的设置显示
                            await loadSettingsForModal();
                        }
                        // 通知后台脚本设置已恢复（如果需要）
                        chrome.runtime.sendMessage({ action: "settingsRestored" }, response => {
                            if (chrome.runtime.lastError) { /* 忽略错误 */ }
                        });
                        if (fromModal) closeSettingsModal(); // 如果从模态框调用，则关闭它
                    }
                },
                { text: '取消', class: '' } // 普通取消按钮
            ],
            options: { textareaRows: 2, enterConfirms: true } // 模态框选项
        });
    }
    
    /**
     * 将当前 `currentSettings` 对象中的所有UI相关设置应用到页面。
     */
    function applyAllSettingsToUI() {
        applyHeaderVisibilitySettings(); // 应用头部按钮的显示/隐藏
        applyCurrentTheme(); // 应用主题
        applySettingsIconVisibility(currentSettings.hoverToShowSettingsIcon); // 应用设置图标可见性
        applyDragAndDropSetting(currentSettings.enableDragAndDrop); // 应用拖放设置
        renderGroups(); // 重新渲染标签组（可能涉及按钮显示和拖放属性）

        // 根据主题偏好管理系统主题变化监听器
        systemThemeQuery.removeEventListener('change', handleSystemThemeChangeForMainPage);
        if (currentSettings.themePreference === 'system') {
            systemThemeQuery.addEventListener('change', handleSystemThemeChangeForMainPage);
        }
    }

    /**
     * 为设置模态框加载并填充设置项。
     * @returns {Promise<void>}
     */
    async function loadSettingsForModal() {
        return new Promise(resolve => {
            chrome.storage.sync.get(defaultSettings, (settingsFromStorage) => {
                const { settingsModalContent } = DOMElements;
                if (!settingsModalContent) { resolve(); return; }

                // 辅助函数：设置模态框内的复选框状态
                const setModalCheckbox = (idSuffix, value) => {
                    const el = settingsModalContent.querySelector(`#settingsModal_${idSuffix}`);
                    if (el) el.checked = value;
                };
                // 辅助函数：设置模态框内的单选按钮状态
                const setModalRadio = (name, value) => {
                    settingsModalContent.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
                        if (radio.value === value) radio.checked = true;
                    });
                };

                // 加载各项设置到模态框的对应控件
                setModalRadio('themePreference', settingsFromStorage.themePreference);
                setModalCheckbox('hoverToShowSettingsIcon', settingsFromStorage.hoverToShowSettingsIcon);
                setModalCheckbox('enableDragAndDrop', settingsFromStorage.enableDragAndDrop);
                setModalRadio('iconAction', settingsFromStorage.iconAction);
                setModalCheckbox('searchGroupTitles', settingsFromStorage.searchGroupTitles);
                setModalCheckbox('searchTabURLs', settingsFromStorage.searchTabURLs);
                setModalCheckbox('showHeaderSearch', settingsFromStorage.showHeaderSearch);
                setModalCheckbox('showHeaderOpenAll', settingsFromStorage.showHeaderOpenAll);
                setModalCheckbox('showHeaderDeleteAll', settingsFromStorage.showHeaderDeleteAll);
                setModalCheckbox('showHeaderExport', settingsFromStorage.showHeaderExport);
                setModalCheckbox('showHeaderImport', settingsFromStorage.showHeaderImport);
                setModalCheckbox('showGroupOpenButton', settingsFromStorage.showGroupOpenButton);
                setModalCheckbox('showGroupDeleteButton', settingsFromStorage.showGroupDeleteButton);
                setModalCheckbox('showGroupExportButton', settingsFromStorage.showGroupExportButton);
                resolve();
            });
        });
    }

    /**
     * 从设置模态框中保存用户修改的设置。
     * @returns {Promise<boolean>} 保存成功则解析为 true，否则为 false。
     */
    async function saveSettingsFromModal() {
        const { settingsModalContent } = DOMElements;
        if (!settingsModalContent) return Promise.resolve(false);

        // 读取模态框中各项设置的值
        let selectedThemePreference = defaultSettings.themePreference;
        settingsModalContent.querySelectorAll('input[name="themePreference"]').forEach(radio => {
            if (radio.checked) selectedThemePreference = radio.value;
        });

        let selectedIconActionModal = defaultSettings.iconAction;
        settingsModalContent.querySelectorAll('input[name="iconAction"]').forEach(radio => {
            if (radio.checked) selectedIconActionModal = radio.value;
        });

        const getModalCheckbox = (idSuffix, defaultValue) => {
            const el = settingsModalContent.querySelector(`#settingsModal_${idSuffix}`);
            return el ? el.checked : defaultValue;
        };

        const newSettings = {
            themePreference: selectedThemePreference,
            hoverToShowSettingsIcon: getModalCheckbox('hoverToShowSettingsIcon', defaultSettings.hoverToShowSettingsIcon),
            enableDragAndDrop: getModalCheckbox('enableDragAndDrop', defaultSettings.enableDragAndDrop),
            iconAction: selectedIconActionModal,
            searchGroupTitles: getModalCheckbox('searchGroupTitles', defaultSettings.searchGroupTitles),
            searchTabURLs: getModalCheckbox('searchTabURLs', defaultSettings.searchTabURLs),
            showHeaderSearch: getModalCheckbox('showHeaderSearch', defaultSettings.showHeaderSearch),
            showHeaderOpenAll: getModalCheckbox('showHeaderOpenAll', defaultSettings.showHeaderOpenAll),
            showHeaderDeleteAll: getModalCheckbox('showHeaderDeleteAll', defaultSettings.showHeaderDeleteAll),
            showHeaderExport: getModalCheckbox('showHeaderExport', defaultSettings.showHeaderExport),
            showHeaderImport: getModalCheckbox('showHeaderImport', defaultSettings.showHeaderImport),
            showGroupOpenButton: getModalCheckbox('showGroupOpenButton', defaultSettings.showGroupOpenButton),
            showGroupDeleteButton: getModalCheckbox('showGroupDeleteButton', defaultSettings.showGroupDeleteButton),
            showGroupExportButton: getModalCheckbox('showGroupExportButton', defaultSettings.showGroupExportButton),
        };

        return new Promise(resolve => {
            chrome.storage.sync.set(newSettings, () => {
                if (chrome.runtime.lastError) {
                    showToast('保存设置失败: ' + chrome.runtime.lastError.message, "error");
                    resolve(false);
                } else {
                    currentSettings = newSettings; // 更新内存中的当前设置
                    showToast('设置已保存！', "success");
                    applyAllSettingsToUI(); // 应用新设置到主页面UI
                    resolve(true);
                }
            });
        });
    }

    // 用于设置模态框的回车键监听器
    let settingsModalEnterListener = null;
    /**
     * 打开设置模态框。
     * 动态加载 options.html 的内容到模态框中。
     */
    async function openSettingsModal() {
        const { settingsModalContainer, settingsModalContent, settingsModalDialog, saveSettingsInModalBtn } = DOMElements;
        if (!settingsModalContainer || !settingsModalContent || !settingsModalDialog) {
            console.error("设置模态框元素未找到。");
            return;
        }

        try {
            // 获取 options.html 的内容
            const response = await fetch(chrome.runtime.getURL('pages/options.html'));
            if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
            const htmlText = await response.text();
            const parser = new DOMParser();
            const optionsDoc = parser.parseFromString(htmlText, 'text/html');
            const allSections = optionsDoc.body.querySelectorAll('.settings-section'); // 获取所有设置区域

            settingsModalContent.innerHTML = ''; // 清空现有内容
            if (allSections.length === 0) {
                settingsModalContent.innerHTML = "<p>无法加载设置表单内容。</p>";
            } else {
                // 克隆每个设置区域并修改ID以避免冲突，然后添加到模态框
                allSections.forEach(section => {
                    const clonedSection = section.cloneNode(true);
                    clonedSection.querySelectorAll('input[id]').forEach(inputEl => {
                        const oldId = inputEl.id;
                        const newId = `settingsModal_${oldId}`; // 为模态框内的元素ID添加前缀
                        inputEl.id = newId;
                        clonedSection.querySelectorAll(`label[for="${oldId}"]`).forEach(label => {
                            label.setAttribute('for', newId);
                        });
                    });
                    settingsModalContent.appendChild(clonedSection);
                });
            }

            // 动态添加“恢复默认”按钮到模态框页脚
            const modalButtonsDiv = settingsModalDialog.querySelector('.modal-buttons');
            if (modalButtonsDiv) {
                let leftButtonsDiv = modalButtonsDiv.querySelector('.left-buttons');
                if (!leftButtonsDiv) { // 如果左侧按钮容器不存在，则创建
                    leftButtonsDiv = document.createElement('div');
                    leftButtonsDiv.className = 'left-buttons';
                    modalButtonsDiv.insertBefore(leftButtonsDiv, modalButtonsDiv.firstChild);
                }
                if (!leftButtonsDiv.querySelector('#restoreDefaultSettingsInModal')) {
                    const restoreBtnInModal = createButton({
                        id: 'restoreDefaultSettingsInModal',
                        text: '恢复默认',
                        className: 'btn btn-restore-default', // 使用与 options.html 中一致的样式
                        onClick: () => restoreDefaultSettings(true) // 传入 true 表示从模态框调用
                    });
                    leftButtonsDiv.appendChild(restoreBtnInModal);
                }
            }
        } catch (error) {
            console.error("加载 options.html 内容失败:", error);
            settingsModalContent.innerHTML = "<p>加载设置时出错。</p>";
        }

        await loadSettingsForModal(); // 加载当前设置到模态框
        settingsModalContainer.classList.add('show'); // 显示模态框

        // 设置回车键监听器
        if (settingsModalEnterListener) {
            settingsModalDialog.removeEventListener('keydown', settingsModalEnterListener);
        }
        settingsModalEnterListener = async (event) => {
            if (event.key === 'Enter' && settingsModalContainer.classList.contains('show')) {
                 const activeEl = document.activeElement;
                // 如果焦点在文本区域或非“保存/恢复默认”按钮上，则不触发
                if (activeEl && (activeEl.tagName === 'TEXTAREA' || (activeEl.tagName === 'BUTTON' && activeEl !== saveSettingsInModalBtn && activeEl.id !== 'restoreDefaultSettingsInModal'))) {
                    return;
                }
                event.preventDefault();
                const saved = await saveSettingsFromModal();
                if (saved) closeSettingsModal();
            }
        };
        settingsModalDialog.setAttribute('tabindex', '-1'); // 使对话框可聚焦以接收键盘事件
        settingsModalDialog.focus();
        settingsModalDialog.addEventListener('keydown', settingsModalEnterListener);
    }

    /**
     * 关闭设置模态框。
     */
    function closeSettingsModal() {
        const { settingsModalContainer, settingsModalDialog } = DOMElements;
        if (settingsModalContainer) settingsModalContainer.classList.remove('show');
        // 移除回车键监听器
        if (settingsModalEnterListener && settingsModalDialog) {
            settingsModalDialog.removeEventListener('keydown', settingsModalEnterListener);
            settingsModalEnterListener = null;
        }
    }

    /**
     * 加载并应用初始的用户设置。
     * @returns {Promise<void>}
     */
    async function loadAndApplyInitialSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(defaultSettings, (settings) => {
                currentSettings = settings; // 更新内存中的当前设置
                applyAllSettingsToUI(); // 应用设置到UI
                resolve();
            });
        });
    }

    /**
     * 根据当前设置应用头部按钮（搜索、全部打开等）的显示/隐藏状态。
     */
    function applyHeaderVisibilitySettings() {
        if (!currentSettings || Object.keys(currentSettings).length === 0) return; // 确保设置已加载
        const { searchBoxContainer, openAllButton, deleteAllButton, exportAllDropdownContainer, importAllDropdownContainer } = DOMElements;

        if (searchBoxContainer) searchBoxContainer.classList.toggle('hidden', !currentSettings.showHeaderSearch);
        if (openAllButton) openAllButton.classList.toggle('hidden', !currentSettings.showHeaderOpenAll);
        if (deleteAllButton) deleteAllButton.classList.toggle('hidden', !currentSettings.showHeaderDeleteAll);
        if (exportAllDropdownContainer) exportAllDropdownContainer.classList.toggle('hidden', !currentSettings.showHeaderExport);
        if (importAllDropdownContainer) importAllDropdownContainer.classList.toggle('hidden', !currentSettings.showHeaderImport);
    }

    // 监听来自后台脚本或其他扩展页面的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.action === "update" && Array.isArray(message.groups)) {
            // 后台脚本通知标签组数据已更新
            groupsCache = message.groups.map(g => ({ // 标准化传入的组数据结构
                id: g.id || `msg-id-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                createTime: g.createTime || new Date().toLocaleString(),
                customName: g.customName || g.createTime || `未命名组`,
                tabs: Array.isArray(g.tabs) ? g.tabs.map(t => ({
                    title: t.title || "未命名标签页",
                    url: t.url || "#",
                    favIconUrl: t.favIconUrl || ""
                })) : []
            }));
            renderGroups(); // 重新渲染标签组列表
            sendResponse({ success: true, message: "管理页面已更新" });
        } else if (message?.action === "settingsUpdated" && message.settings) {
            // 选项页面通知设置已更新
            currentSettings = message.settings;
            applyAllSettingsToUI(); // 应用新设置到UI
            showToast("设置已从选项页更新！", "success");
            sendResponse({ success: true });
        } else if (message?.action === "settingsRestored") {
            // 选项页面通知设置已恢复默认
            loadAndApplyInitialSettings().then(() => {
                showToast("默认设置已在管理页面应用！", "success");
            });
            sendResponse({ success: true });
        }
        return true; // 表明将异步发送响应
    });

    /**
     * 防抖地同步标签组数据到本地存储。
     * @param {Array<Object>} updatedGroupsInput - 最新的标签组数据数组。
     */
    async function syncGroupsDebounced(updatedGroupsInput) {
        clearTimeout(syncTimeout); // 清除之前的定时器
        syncTimeout = setTimeout(async () => {
            if (isSyncing) return; // 如果正在同步，则忽略此次调用
            isSyncing = true;
            try {
                const groupsToProcess = Array.isArray(updatedGroupsInput) ? updatedGroupsInput : groupsCache;
                // 过滤并标准化待保存的组数据
                const groupsToSave = groupsToProcess.map(g => ({
                    id: g.id || `sync-id-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    createTime: g.createTime || new Date().toLocaleString(),
                    customName: (g.customName || "").trim() === "" ? (g.createTime || `未命名组 ${g.idShort || g.id || ''}`) : g.customName.trim(),
                    tabs: Array.isArray(g.tabs) ? g.tabs.map(t => ({
                        title: t.title || "未命名标签页",
                        url: t.url || "#",
                        favIconUrl: t.favIconUrl || ""
                    })) : []
                })).filter(group => Array.isArray(group.tabs) && group.tabs.length > 0); // 只保存包含标签页的组

                groupsCache = groupsToSave; // 更新内存缓存
                await chrome.storage.local.set({ savedTabsGroups: groupsToSave }); // 保存到本地存储
                renderGroups(); // 保存成功后重新渲染
            } catch (error) {
                console.error("pages/index.js: 同步失败：", error);
                showToast("数据同步失败", "error");
            } finally {
                isSyncing = false; // 重置同步标记
            }
        }, 300); // 300毫秒延迟
    }

    /**
     * 从本地存储加载标签组数据到 `groupsCache` 并渲染。
     */
    async function loadGroupsFromStorage() {
        try {
            const data = await chrome.storage.local.get("savedTabsGroups");
            groupsCache = (data?.savedTabsGroups || []).map(g => ({ // 标准化加载的组数据结构
                id: g.id || `load-id-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                createTime: g.createTime || new Date().toLocaleString(),
                customName: g.customName || g.createTime || `未命名组 ${g.idShort || g.id || ''}`,
                tabs: Array.isArray(g.tabs) ? g.tabs.map(t => ({
                    title: t.title || "未命名标签页",
                    url: t.url || "#",
                    favIconUrl: t.favIconUrl || ""
                })) : []
            }));
        } catch (error) {
            console.error("pages/index.js: 加载数据失败：", error);
            groupsCache = []; // 出错时清空缓存
            showToast("加载本地数据失败", "error");
        } finally {
            renderGroups(); // 总是渲染，即使数据为空或加载失败
        }
    }

    /**
     * 根据搜索词过滤标签组。
     * @param {Array<Object>} groupsToFilter - 需要过滤的原始标签组数组。
     * @param {string} searchTerm - 搜索关键词。
     * @returns {Array<Object>} 过滤后的标签组数组，每个组可能包含 isForceVisible 属性。
     */
    const filterGroupsBySearchTerm = (groupsToFilter, searchTerm) => {
        if (!Array.isArray(groupsToFilter)) return [];
        if (!searchTerm) return groupsToFilter.map(group => ({ ...group, isForceVisible: false })); // 没有搜索词则返回所有组

        const lowerSearchTerm = searchTerm.toLowerCase(); // 转换为小写以进行不区分大小写的搜索
        const searchInGroupTitles = currentSettings.searchGroupTitles ?? defaultSettings.searchGroupTitles;
        const searchInTabURLs = currentSettings.searchTabURLs ?? defaultSettings.searchTabURLs;

        return groupsToFilter.map(group => {
            if (!group || typeof group !== 'object') return null; // 跳过无效的组数据

            const groupName = (group.customName || group.createTime || "").toString();
            const groupNameMatches = searchInGroupTitles && groupName.toLowerCase().includes(lowerSearchTerm); // 检查组名是否匹配

            const groupTabs = Array.isArray(group.tabs) ? group.tabs : [];
            // 过滤组内匹配的标签页（标题或URL）
            const matchingTabs = groupTabs.filter(tab =>
                ((tab.title || "").toLowerCase().includes(lowerSearchTerm)) ||
                (searchInTabURLs && ((tab.url || "").toLowerCase().includes(lowerSearchTerm)))
            );

            if (groupNameMatches) return { ...group, tabs: groupTabs, isForceVisible: true }; // 组名匹配，则显示整个组
            if (matchingTabs.length > 0) return { ...group, tabs: matchingTabs, isForceVisible: false }; // 组内有标签页匹配，则显示这些标签页
            // 如果当前组是正在被拖动的组，则强制显示它（避免拖动时因搜索词而消失）
            if (draggedItemInfo?.data?.id === group.id) return { ...group, tabs: groupTabs, isForceVisible: true };

            return null; // 组名和标签页都不匹配，则不显示此组
        }).filter(group => group !== null); // 移除结果中的 null 值
    };

    /**
     * 显示通用模态框（用于提示、确认等）。
     * @param {Object} config - 模态框配置。
     * @param {string} config.title - 模态框标题。
     * @param {string} config.content - 模态框内容文本。
     * @param {Array<Object>} [config.buttons] - 按钮配置数组。
     * @param {Object} [config.options] - 其他选项，如 textareaRows, enterConfirms。
     */
    function showGenericModal({ title, content, buttons = [{ text: '关闭', class: 'btn', id: 'closeGenericModalBtn' }], options = {} }) {
        const { genericModal, genericModalTitle, genericModalTextarea, genericModalButtons } = DOMElements;
        if (!genericModal || !genericModalTitle || !genericModalTextarea || !genericModalButtons) {
            console.error("通用模态框元素未找到。");
            return;
        }
        genericModalTitle.textContent = title;
        genericModalTextarea.value = content; // 设置文本区域内容
        genericModalButtons.innerHTML = ''; // 清空旧按钮

        // 根据内容调整文本区域高度
        genericModalTextarea.rows = options.textareaRows || 3;
        genericModalTextarea.style.minHeight = options.textareaRows ? 'auto' : '60px';
        genericModalTextarea.style.height = 'auto'; // 重置高度以获取正确 scrollHeight
        let scrollHeight = genericModalTextarea.scrollHeight;
        const maxHeight = parseInt(window.getComputedStyle(genericModalTextarea).maxHeight, 10) || Infinity;
        genericModalTextarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`; // 设置高度，但不超过最大高度

        // 移除之前的键盘事件监听器，防止重复绑定
        if (genericModal.currentEscListener) document.removeEventListener("keydown", genericModal.currentEscListener);
        if (genericModal.currentEnterListener) document.removeEventListener("keydown", genericModal.currentEnterListener);

        // 添加 Escape 键关闭模态框的监听器
        genericModal.currentEscListener = (e) => { if (e.key === "Escape") closeGenericModal(); };
        document.addEventListener("keydown", genericModal.currentEscListener);

        // 创建并添加按钮
        buttons.forEach(btnConfig => {
            const button = createButton({
                text: btnConfig.text,
                className: `btn ${btnConfig.class || ''}`, // 应用基础样式和自定义样式
                id: btnConfig.id,
                onClick: async () => {
                    if (btnConfig.action) { // 如果按钮配置了动作，则执行
                        try { await btnConfig.action(content); } // 传入内容供动作函数使用
                        catch (err) { console.error("模态框操作执行错误:", err); showToast("操作失败", "error"); }
                    }
                    if (btnConfig.closesModal !== false) closeGenericModal(); // 默认点击按钮后关闭模态框
                }
            });
            genericModalButtons.appendChild(button);

            // 如果配置了 enterConfirms 且按钮是主要或危险操作按钮，则添加回车键确认监听
            if (options.enterConfirms && (btnConfig.class?.includes('btn-primary') || btnConfig.class?.includes('btn-danger'))) {
                genericModal.currentEnterListener = (e) => {
                    if (e.key === "Enter" && genericModal.classList.contains('show')) {
                        if (document.activeElement?.tagName === 'TEXTAREA') return; // 如果焦点在文本区域，则不触发
                        e.preventDefault();
                        button.click(); // 模拟点击该按钮
                    }
                };
                document.addEventListener("keydown", genericModal.currentEnterListener);
            }
        });
        genericModal.classList.add('show'); // 显示模态框
    }

    /**
     * 关闭通用模态框，并移除相关的键盘事件监听器。
     */
    function closeGenericModal() {
        const { genericModal } = DOMElements;
        if (!genericModal) return;
        genericModal.classList.remove('show');
        // 清理事件监听器
        if (genericModal.currentEscListener) {
            document.removeEventListener("keydown", genericModal.currentEscListener);
            delete genericModal.currentEscListener;
        }
        if (genericModal.currentEnterListener) {
            document.removeEventListener("keydown", genericModal.currentEnterListener);
            delete genericModal.currentEnterListener;
        }
    }

    /**
     * 显示 Markdown 导入模态框。
     */
    function showMarkdownImportModalUI() {
        const { markdownImportModal, markdownPasteArea } = DOMElements;
        if (!markdownImportModal || !markdownPasteArea) {
            console.error("Markdown 导入模态框元素未找到。");
            return;
        }
        markdownPasteArea.value = ""; // 清空粘贴区域
        markdownPasteArea.classList.remove('hidden'); // 确保可见
        markdownImportModal.classList.add('show'); // 显示模态框
        markdownPasteArea.focus(); // 自动聚焦到粘贴区域
    }

    /**
     * 关闭 Markdown 导入模态框。
     */
    function closeMarkdownImportModalUI() {
        DOMElements.markdownImportModal?.classList.remove('show');
    }

    /**
     * 显示一个短暂的提示消息 (toast)。
     * @param {string} message - 需要显示的消息文本。
     * @param {string} [type="success"] - 消息类型 ("success", "error", "info", "warning")，会影响样式。
     */
    function showToast(message, type = "success") {
        const toastId = 'toast-just-onetab'; // 固定ID，确保同一时间只有一个toast
        let toast = document.getElementById(toastId);
        if (toast) toast.remove(); // 如果已存在，则移除旧的

        toast = document.createElement("div");
        toast.id = toastId;
        toast.className = `toast ${type}`; // 应用类型相关的样式
        toast.textContent = message;
        document.body.appendChild(toast);

        // 2.8秒后开始淡出，0.4秒后移除
        setTimeout(() => {
            toast.style.opacity = "0";
            setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 400);
        }, 2800);
    }

    /**
     * 渲染标签组列表到页面。
     * @param {Array<Object>} [customGroupsToRender=null] - 可选参数，如果提供，则渲染此数组中的组，否则渲染 `groupsCache` 经过搜索过滤后的结果。
     */
    function renderGroups(customGroupsToRender = null) {
        const container = DOMElements.groupsContainer;
        if (!container) { console.error("groups-container 元素未找到。"); return; }
        container.innerHTML = ""; // 清空现有内容

        // 获取搜索词，如果搜索框隐藏则视为空
        const searchTerm = DOMElements.searchInput?.parentElement?.classList.contains('hidden') ? "" : DOMElements.searchInput?.value || "";
        // 确定要显示的组：优先使用传入的 customGroupsToRender，否则从 groupsCache 过滤
        const groupsToDisplay = customGroupsToRender ?? filterGroupsBySearchTerm(groupsCache, searchTerm);
        // 计算总标签页数量
        const totalTabCount = groupsCache.reduce((sum, group) => sum + (group.tabs?.length || 0), 0);

        if (DOMElements.tabCount) DOMElements.tabCount.textContent = `( 共 ${totalTabCount} 个标签页 )`; // 更新总数显示

        if (!groupsToDisplay || groupsToDisplay.length === 0) {
            // 如果没有组可显示，则显示提示信息
            const emptyMsg = document.createElement("p");
            emptyMsg.textContent = searchTerm ? "没有匹配搜索结果的组或标签页" : "没有已收纳的标签页，点击浏览器右上角的扩展图标或右键菜单收纳当前窗口的标签页";
            emptyMsg.style.textAlign = "center"; emptyMsg.style.padding = "20px";
            container.appendChild(emptyMsg);
            return;
        }

        const fragment = document.createDocumentFragment(); // 使用文档片段提高渲染性能
        groupsToDisplay.forEach((groupData) => {
            if (!groupData?.id) { console.warn("跳过没有 ID 的组数据。"); return; }
            // 找到该组在原始 groupsCache 中的索引，用于后续操作
            const originalGroupIndex = groupsCache.findIndex(g => g?.id === groupData.id);
            if (originalGroupIndex !== -1) {
                fragment.appendChild(renderGroup(groupData, originalGroupIndex, groupData.isForceVisible));
            } else {
                // 一般不应发生，除非数据不一致
                console.warn(`在主缓存中未找到组 ID: ${groupData.id}`);
            }
        });
        container.appendChild(fragment); // 一次性将所有组添加到容器
    }

    /**
     * 渲染单个标签组的 HTML 结构。
     * @param {Object} group - 标签组数据对象。
     * @param {number} originalGroupIndex - 该组在 `groupsCache` 中的原始索引。
     * @param {boolean} [isForceVisible=false] - 是否强制显示此组（例如，在拖动时）。
     * @returns {HTMLElement} 构建好的标签组 DOM 元素。
     */
    function renderGroup(group, originalGroupIndex, isForceVisible = false) {
        const groupElement = document.createElement("div");
        groupElement.className = "group";
        groupElement.dataset.groupId = group.id; // 存储组ID
        groupElement.dataset.originalGroupIndex = originalGroupIndex; // 存储原始索引

        // 根据设置确定是否可拖动
        const isDraggable = currentSettings.enableDragAndDrop ?? defaultSettings.enableDragAndDrop;
        if (isDraggable) {
            // 为整个组元素添加拖放事件监听器（用于接收拖放的标签页或合并组）
            groupElement.addEventListener("dragover", handleDragOverGroup);
            groupElement.addEventListener("dragleave", handleDragLeaveGroup);
            groupElement.addEventListener("drop", handleDropOnGroup);
        }

        const groupHeader = document.createElement("div");
        groupHeader.className = "group-header";
        groupHeader.draggable = isDraggable; // 组头部可拖动以移动整个组
        groupHeader.style.cursor = isDraggable ? 'grab' : 'default';
        groupHeader.dataset.originalGroupIndex = originalGroupIndex;
        if (isDraggable) {
            groupHeader.addEventListener("dragstart", handleDragStartGroupHeader);
            groupHeader.addEventListener("dragend", handleDragEndItem);
        }

        const groupDisplayNameElement = document.createElement("span");
        groupDisplayNameElement.className = "group-display-name";
        const groupNameToDisplay = group.customName || group.createTime || `组 ${group.id}`; // 确定显示的组名
        const searchTerm = DOMElements.searchInput?.parentElement?.classList.contains('hidden') ? "" : DOMElements.searchInput?.value || "";
        const shouldHighlightGroupTitle = (currentSettings.searchGroupTitles ?? defaultSettings.searchGroupTitles);
        // 如果有搜索词且设置了搜索组标题，则高亮显示组名
        groupDisplayNameElement.innerHTML = (shouldHighlightGroupTitle && searchTerm) ? highlightText(groupNameToDisplay, searchTerm) : escapeHTML(groupNameToDisplay);
        // 双击组名可编辑
        groupDisplayNameElement.addEventListener("dblclick", (e) => {
            e.stopPropagation(); // 防止事件冒泡到组头部
            enableGroupNameEditing(groupDisplayNameElement, originalGroupIndex, groupNameToDisplay);
        });

        const groupInfoElement = document.createElement("span");
        groupInfoElement.className = "group-info";
        groupInfoElement.textContent = `(${group.tabs?.length || 0} 个标签页)`; // 显示组内标签页数量
        groupInfoElement.title = `创建于: ${group.createTime || '未知时间'}`; // 鼠标悬停显示创建时间
        groupInfoElement.addEventListener("dblclick", (e) => e.stopPropagation()); // 防止双击标签数量时触发编辑组名

        // 容器用于更好地控制组名和信息元素的布局
        const groupTitleTextContainer = document.createElement("div");
        groupTitleTextContainer.style.cssText = "display: flex; align-items: center; overflow: hidden;";
        groupTitleTextContainer.append(groupDisplayNameElement, groupInfoElement);

        const groupHeaderLeftContent = document.createElement("div"); // 组头部左侧内容（组名和信息）
        groupHeaderLeftContent.style.cssText = "display: flex; align-items: center; flex-grow: 1; overflow: hidden; margin-right: 10px;";
        groupHeaderLeftContent.appendChild(groupTitleTextContainer);

        const groupActions = document.createElement("div"); // 组头部右侧操作按钮容器
        groupActions.className = "group-actions";
        // 根据设置动态添加组操作按钮
        if (currentSettings.showGroupOpenButton ?? defaultSettings.showGroupOpenButton) {
            groupActions.appendChild(createButton({ text: "打开组", onClick: () => openAllInGroup(originalGroupIndex), className: "group-action-open" }));
        }
        if (currentSettings.showGroupDeleteButton ?? defaultSettings.showGroupDeleteButton) {
            groupActions.appendChild(createButton({ text: "删除组", onClick: () => deleteGroup(originalGroupIndex), className: "group-action-delete" }));
        }
        if (currentSettings.showGroupExportButton ?? defaultSettings.showGroupExportButton) {
            groupActions.appendChild(createDropdown({ // 创建导出下拉菜单
                idPrefix: `export-group-${group.id}`, buttonText: "导出▾",
                items: [
                    { id: `export-group-md-item-${group.id}`, text: "复制为 Markdown", action: () => exportGroupMarkdown(originalGroupIndex) },
                    { id: `export-group-json-item-${group.id}`, text: "导出为 JSON", action: () => exportGroupJSON(originalGroupIndex) },
                    { id: `export-group-html-item-${group.id}`, text: "导出为 HTML", action: () => exportGroupHTML(originalGroupIndex) }
                ],
                isGroupAction: true, containerClass: "group-action-export-dropdown"
            }));
        }

        groupHeader.append(groupHeaderLeftContent); // 添加左侧内容
        if (groupActions.hasChildNodes()) groupHeader.appendChild(groupActions); // 如果有操作按钮，则添加

        const tabsList = document.createElement("div"); // 标签页列表容器
        tabsList.className = "tabs-list";
        const currentTabsInGroup = group.tabs || [];
        const searchVal = DOMElements.searchInput?.parentElement?.classList.contains('hidden') ? "" : DOMElements.searchInput?.value || "";
        const shouldSearchTabURLs = (currentSettings.searchTabURLs ?? defaultSettings.searchTabURLs);

        // 确定要显示的标签页：如果强制显示或无搜索词，则显示全部；否则根据搜索词过滤
        const displayTabs = (isForceVisible || !searchVal) ? currentTabsInGroup : currentTabsInGroup.filter(tab =>
            ((tab.title || "").toLowerCase().includes(searchVal.toLowerCase())) ||
            (shouldSearchTabURLs && ((tab.url || "").toLowerCase().includes(searchVal.toLowerCase())))
        );

        if (displayTabs.length > 0) {
            displayTabs.forEach((tab) => {
                if (!tab) return; // 跳过无效的标签数据
                // 找到该标签页在原始组中的索引
                const originalTabGroup = groupsCache[originalGroupIndex];
                const originalTabIndexInGroup = originalTabGroup?.tabs?.findIndex(t => t?.url === tab.url && t?.title === tab.title) ?? -1;
                if (originalTabIndexInGroup === -1) { console.warn("未找到标签的原始索引:", tab); return; }

                const tabElement = document.createElement("div");
                tabElement.className = "tab-item";
                tabElement.draggable = isDraggable; // 标签项可拖动
                tabElement.style.cursor = isDraggable ? 'grab' : 'pointer';
                // 存储原始索引和URL，用于后续操作和点击事件
                Object.assign(tabElement.dataset, { originalGroupIndex, tabIndexInGroup: originalTabIndexInGroup, tabUrl: tab.url || "#" });

                if (isDraggable) {
                    tabElement.addEventListener("dragstart", handleDragStartTab);
                    tabElement.addEventListener("dragend", handleDragEndItem);
                }

                // 高亮显示标签标题和URL中的搜索词
                const highlightedTitle = searchTerm ? highlightText(tab.title, searchTerm) : escapeHTML(tab.title);
                const highlightedUrl = (shouldSearchTabURLs && searchTerm) ? highlightText(tab.url, searchTerm) : escapeHTML(tab.url);
                const faviconSrc = tab.favIconUrl || "../images/default-icon.png"; // 网站图标，提供备用图标
                const tabTitleCombined = `${escapeHTML(tab.title || '')}\n${escapeHTML(tab.url || '')}`; // 用于 title 属性，悬停显示完整信息

                // 构建标签项的 HTML 内容
                tabElement.innerHTML = `
                    <img src="${faviconSrc}" alt="${escapeHTML(tab.title || '标签页')} 图标" class="favicon" onerror="this.onerror=null;this.src='../images/default-icon.png';">
                    <div class="tab-info">
                        <div class="tab-title" title="${tabTitleCombined}">${highlightedTitle || "未命名标签页"}</div>
                        <div class="tab-url" title="${escapeHTML(tab.url || '')}">${highlightedUrl || "未知URL"}</div>
                    </div>
                    <button class="tab-close" data-original-group-index="${originalGroupIndex}" data-tab-index-in-group="${originalTabIndexInGroup}" title="删除此标签页">×</button>
                `;
                tabsList.appendChild(tabElement);
            });
        } else {
            // 如果组内没有标签页或没有匹配搜索的标签页，则显示提示信息
            tabsList.innerHTML = `<p style="text-align:center; padding: 5px; color: #888; font-size:0.9em;">${currentTabsInGroup.length === 0 ? "此组为空" : (searchVal ? "组内无匹配搜索的标签页" : "将标签页拖到此处")}</p>`;
        }
        groupElement.append(groupHeader, tabsList); // 组合头部和列表到组元素
        return groupElement;
    }

    /**
     * 创建一个按钮元素。
     * @param {Object} config - 按钮配置。
     * @param {string} config.text - 按钮文本。
     * @param {Function} config.onClick - 点击事件处理函数。
     * @param {string} [config.className=''] - CSS 类名。
     * @param {string} [config.id=''] - 元素 ID。
     * @param {string} [config.title=''] - 鼠标悬停提示文本。
     * @returns {HTMLButtonElement} 创建的按钮元素。
     */
    function createButton({ text, onClick, className = '', id = '', title = '' }) {
        const button = document.createElement("button");
        if (className) button.className = className;
        if (id) button.id = id;
        if (title) button.title = title;
        button.textContent = text;
        button.addEventListener("click", (e) => {
            e.stopPropagation(); // 阻止事件冒泡，避免触发父元素的点击事件
            onClick();
        });
        return button;
    }

    /**
     * 创建一个下拉菜单组件。
     * @param {Object} config - 下拉菜单配置。
     * @param {string} config.idPrefix - 用于生成元素ID的前缀。
     * @param {string} config.buttonText - 下拉切换按钮的文本（可包含HTML，如箭头）。
     * @param {Array<Object>} config.items - 下拉菜单项的配置数组。
     * @param {boolean} [config.isGroupAction=false] - 是否是组操作下拉菜单（影响样式或定位）。
     * @param {string} [config.containerClass=''] - 下拉菜单容器的额外CSS类。
     * @returns {HTMLDivElement} 创建的下拉菜单组件根元素。
     */
    function createDropdown({ idPrefix, buttonText, items, isGroupAction = false, containerClass = '' }) {
        const dropdownDiv = document.createElement("div");
        dropdownDiv.className = `dropdown ${containerClass}`.trim();

        const toggleButton = createButton({ // 创建切换按钮
            id: `${idPrefix}-main-btn`,
            text: buttonText,
            className: "dropdown-toggle",
            onClick: (e) => { /* 点击事件由下面的直接监听器处理 */ }
        });
        toggleButton.innerHTML = buttonText; // 允许按钮文本包含HTML（如 '▾' 箭头）

        const menuDiv = document.createElement("div"); // 创建下拉菜单本身
        menuDiv.className = "dropdown-menu";
        menuDiv.id = `${idPrefix}-options-menu`;
        // 简化的定位逻辑，当前总是右对齐
        menuDiv.style.right = (isGroupAction || !isGroupAction) ? '0' : undefined;

        items.forEach(item => { // 为每个菜单项创建按钮
            menuDiv.appendChild(createButton({
                text: item.text,
                id: item.id,
                className: "dropdown-item",
                onClick: () => { item.action(); menuDiv.classList.remove("show"); } // 点击后执行动作并关闭菜单
            }));
        });

        dropdownDiv.append(toggleButton, menuDiv); // 组合按钮和菜单
        // 为切换按钮添加事件监听，用于显示/隐藏菜单
        toggleButton.addEventListener("click", (e) => {
            e.stopPropagation(); // 阻止冒泡
            closeAllDropdowns(menuDiv); // 关闭其他已打开的下拉菜单
            menuDiv.classList.toggle("show"); // 切换当前菜单的显示状态
        });
        return dropdownDiv;
    }

    /**
     * 关闭所有已打开的下拉菜单，可选地排除某个特定菜单。
     * @param {HTMLElement} [exceptThisOne=null] - 需要保留打开状态的菜单元素。
     */
    function closeAllDropdowns(exceptThisOne = null) {
        document.querySelectorAll(".dropdown-menu.show").forEach(menu => {
            if (menu !== exceptThisOne) menu.classList.remove("show");
        });
    }

    // 全局点击事件监听器，用于在点击页面其他区域时关闭下拉菜单和模态框
    window.addEventListener("click", (event) => {
        const target = event.target;
        // 如果点击目标不是下拉切换按钮，也不在打开的下拉菜单内，
        // 并且不在设置模态框内或设置齿轮按钮上，则关闭所有下拉菜单。
        if (!target.matches('.dropdown-toggle') && !target.closest('.dropdown-menu.show') &&
            !target.closest('#settingsModalContainer .modal') && !target.matches('#settings-gear-btn') && !target.closest('#settings-gear-btn')) {
            closeAllDropdowns();
        }
    });
    // 全局键盘事件监听器，用于通过 Escape 键关闭模态框
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const { settingsModalContainer, markdownImportModal, genericModal } = DOMElements;
            if (settingsModalContainer?.classList.contains('show')) closeSettingsModal();
            else if (markdownImportModal?.classList.contains('show')) closeMarkdownImportModalUI();
            else if (genericModal?.classList.contains('show')) closeGenericModal();
        }
    });

    /**
     * 启用标签组名称的编辑模式。
     * @param {HTMLElement} displayNameElement - 显示组名的元素。
     * @param {number} groupIndex - 组在 `groupsCache` 中的索引。
     * @param {string} originalNameToEdit - 原始组名。
     */
    function enableGroupNameEditing(displayNameElement, groupIndex, originalNameToEdit) {
        const inputElement = document.createElement("input"); // 创建输入框
        inputElement.type = "text";
        inputElement.className = "group-name-input";
        inputElement.value = originalNameToEdit;

        const groupHeader = displayNameElement.closest('.group-header');
        if (groupHeader) groupHeader.draggable = false; // 编辑时禁用组拖动

        displayNameElement.replaceWith(inputElement); // 用输入框替换显示元素
        inputElement.focus(); // 自动聚焦
        inputElement.select(); // 全选文本

        // 完成编辑的逻辑（保存或取消）
        const finalizeEdit = async (saveChanges) => {
            if (groupHeader) groupHeader.draggable = true; // 恢复组拖动
            const newName = inputElement.value.trim();
            const searchTerm = DOMElements.searchInput?.parentElement?.classList.contains('hidden') ? "" : DOMElements.searchInput?.value || "";

            if (saveChanges && newName && newName !== originalNameToEdit && groupsCache[groupIndex]) {
                // 如果保存更改，且新名称有效且与原名称不同
                groupsCache[groupIndex].customName = newName;
                await syncGroupsDebounced([...groupsCache]); // 同步并重新渲染
            } else {
                // 取消更改或名称未变，则恢复显示原名称
                displayNameElement.innerHTML = highlightText(originalNameToEdit, searchTerm);
                inputElement.replaceWith(displayNameElement); // 用显示元素替换回输入框
            }
        };

        // 输入框失去焦点时，视为保存更改
        inputElement.addEventListener("blur", () => finalizeEdit(true));
        // 键盘事件：回车保存，Escape取消
        inputElement.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); finalizeEdit(true); }
            else if (e.key === "Escape") { e.preventDefault(); finalizeEdit(false); }
        });
    }

    // ====== 拖放处理函数 ======

    /** 处理标签项开始拖动事件 */
    function handleDragStartTab(event) {
        if (!(currentSettings.enableDragAndDrop ?? defaultSettings.enableDragAndDrop)) { event.preventDefault(); return; }
        // 如果拖动始于按钮内部（非标签项本身），则阻止拖动
        if (event.target.closest('button') && !event.target.classList.contains('tab-item')) { event.preventDefault(); return; }
        const tabElement = event.target.closest(".tab-item");
        if (!tabElement) return;
        event.stopPropagation(); // 阻止事件冒泡，避免触发组头的拖动

        const sourceGroupIndex = parseInt(tabElement.dataset.originalGroupIndex, 10);
        const sourceTabIndexInGroup = parseInt(tabElement.dataset.tabIndexInGroup, 10);

        // 验证索引和数据有效性
        if (isNaN(sourceGroupIndex) || isNaN(sourceTabIndexInGroup) || !groupsCache[sourceGroupIndex]?.tabs?.[sourceTabIndexInGroup]) {
            event.preventDefault(); return;
        }
        const tabData = { ...groupsCache[sourceGroupIndex].tabs[sourceTabIndexInGroup] }; // 复制标签数据
        draggedItemInfo = { type: 'tab', data: tabData, sourceGroupIndex, sourceTabIndexInGroup }; // 存储被拖动项信息

        event.dataTransfer.effectAllowed = 'move'; // 设置允许的拖放效果
        event.dataTransfer.setData('text/plain', tabData.url || `tab-${Date.now()}`); // 设置拖动数据（URL或唯一标识）
        tabElement.classList.add("dragging"); // 添加拖动样式
    }

    /** 处理组头部开始拖动事件 */
    function handleDragStartGroupHeader(event) {
        if (!(currentSettings.enableDragAndDrop ?? defaultSettings.enableDragAndDrop)) { event.preventDefault(); return; }
        // 如果拖动始于组名输入框、显示元素或操作按钮，则阻止拖动
        const targetClasses = ['group-name-input', 'group-display-name'];
        if (event.target.closest('button, .group-actions') || targetClasses.some(cls => event.target.classList.contains(cls)) || event.target.closest(`.${targetClasses.join(', .')}`)) {
            event.preventDefault(); return;
        }

        const groupHeaderElement = event.target.closest(".group-header");
        const groupElement = groupHeaderElement?.closest(".group");
        if (!groupHeaderElement || !groupElement) return;

        const sourceGroupIndex = parseInt(groupHeaderElement.dataset.originalGroupIndex, 10);
        if (isNaN(sourceGroupIndex) || !groupsCache[sourceGroupIndex]) { event.preventDefault(); return; }

        const groupData = { ...groupsCache[sourceGroupIndex] }; // 复制组数据
        draggedItemInfo = { type: 'group', data: groupData, sourceGroupIndex }; // 存储被拖动项信息

        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/json', JSON.stringify({ groupId: groupData.id, type: 'group' })); // 设置拖动数据
        groupElement.classList.add("dragging-group"); // 添加组拖动样式
    }

    /** 处理拖动结束事件（标签项或组头部） */
    function handleDragEndItem(event) {
        const draggedElement = event.target.closest(".tab-item, .group-header");
        // 移除拖动相关样式
        draggedElement?.classList.remove("dragging", "dragging-group");
        if (draggedElement?.classList.contains('group-header')) {
            draggedElement.closest(".group")?.classList.remove("dragging-group");
        }
        // 清除所有组的拖放悬停样式
        document.querySelectorAll('.group.drag-over').forEach(el => el.classList.remove('drag-over'));
        draggedItemInfo = null; // 清空被拖动项信息
    }

    /** 处理拖动项在组元素上悬停的事件 */
    function handleDragOverGroup(event) {
        if (!(currentSettings.enableDragAndDrop ?? defaultSettings.enableDragAndDrop)) return;
        event.preventDefault(); // 必须阻止默认行为以允许 drop
        event.dataTransfer.dropEffect = 'move'; // 设置放置效果
        const groupElement = event.target.closest(".group");
        // 如果是有效拖动目标（不是拖动组到自身），则添加悬停样式
        if (groupElement && draggedItemInfo && !(draggedItemInfo.type === 'group' && groupElement.dataset.groupId === draggedItemInfo.data.id)) {
            groupElement.classList.add("drag-over");
        }
    }

    /** 处理拖动项离开组元素悬停区域的事件 */
    function handleDragLeaveGroup(event) {
        if (!(currentSettings.enableDragAndDrop ?? defaultSettings.enableDragAndDrop)) return;
        const groupElement = event.target.closest(".group");
        // 如果鼠标确实离开了组元素（而不是进入其子元素），则移除悬停样式
        if (groupElement && !groupElement.contains(event.relatedTarget)) {
            groupElement.classList.remove("drag-over");
        }
    }

    /** 处理拖动项在组元素上释放（放置）的事件 */
    async function handleDropOnGroup(event) {
        if (!(currentSettings.enableDragAndDrop ?? defaultSettings.enableDragAndDrop)) return;
        event.preventDefault(); // 阻止默认行为（如打开链接）
        const targetGroupElement = event.target.closest(".group");
        targetGroupElement?.classList.remove("drag-over"); // 移除悬停样式
        if (!targetGroupElement || !draggedItemInfo) return; // 无效放置目标或无拖动项

        const targetOriginalGroupIndex = parseInt(targetGroupElement.dataset.originalGroupIndex, 10);
        if (isNaN(targetOriginalGroupIndex) || !groupsCache[targetOriginalGroupIndex]) return; // 无效目标组索引
        // 如果是拖动组到自身，则不处理
        if (draggedItemInfo.type === 'group' && targetGroupElement.dataset.groupId === draggedItemInfo.data.id) return;

        let itemMoved = false; // 标记数据是否发生变化
        if (draggedItemInfo.type === 'tab') { // 如果拖动的是标签页
            const { data: tabData, sourceGroupIndex, sourceTabIndexInGroup } = draggedItemInfo;
            if (sourceGroupIndex !== targetOriginalGroupIndex) { // 仅当目标组与源组不同时处理
                groupsCache[sourceGroupIndex]?.tabs?.splice(sourceTabIndexInGroup, 1); // 从源组移除
                groupsCache[targetOriginalGroupIndex]?.tabs?.push(tabData); // 添加到目标组
                itemMoved = true;
            }
        } else if (draggedItemInfo.type === 'group') { // 如果拖动的是整个组（合并操作）
            const { data: sourceGroupData, sourceGroupIndex } = draggedItemInfo;
            if (sourceGroupIndex === targetOriginalGroupIndex) return; // 不能合并到自身
            // 将源组的所有标签页添加到目标组
            groupsCache[targetOriginalGroupIndex]?.tabs?.push(...(sourceGroupData.tabs || []));
            // 从缓存中移除源组
            const idxToRemove = groupsCache.findIndex(g => g.id === sourceGroupData.id);
            if (idxToRemove !== -1) {
                groupsCache.splice(idxToRemove, 1);
                itemMoved = true;
            }
        }
        if (itemMoved) await syncGroupsDebounced([...groupsCache]); // 如果数据变化，则同步并重新渲染
    }

    // ====== 操作处理函数 (打开, 删除等) ======

    /** 处理标签项点击事件（打开标签或删除标签） */
    async function handleTabClick(event) {
        const tabElement = event.target.closest(".tab-item");
        // 忽略正在拖动、有拖动信息或在编辑组名时的点击
        if (!tabElement || tabElement.classList.contains("dragging") || draggedItemInfo || event.target.closest('.group-name-input')) return;

        const originalGroupIndex = parseInt(tabElement.dataset.originalGroupIndex, 10);
        const tabIndexInGroup = parseInt(tabElement.dataset.tabIndexInGroup, 10);
        const tabToProcess = groupsCache[originalGroupIndex]?.tabs?.[tabIndexInGroup];
        if (!tabToProcess) { showToast("操作失败：标签信息无效", "error"); return; }

        if (event.target.classList.contains("tab-close")) { // 如果点击的是关闭按钮
            groupsCache[originalGroupIndex].tabs.splice(tabIndexInGroup, 1); // 从缓存中移除标签
            await syncGroupsDebounced([...groupsCache]); // 同步并重新渲染
            showToast("标签页已移除", "success");
        } else if (tabToProcess.url && tabToProcess.url !== "#") { // 如果点击的是标签项本身（非关闭按钮）且URL有效
            try {
                await chrome.tabs.create({ url: tabToProcess.url, active: true }); // 在新标签页中打开链接
                groupsCache[originalGroupIndex].tabs.splice(tabIndexInGroup, 1); // 从缓存中移除已打开的标签
                await syncGroupsDebounced([...groupsCache]); // 同步并重新渲染
            } catch (e) { showToast("打开标签页失败", "error"); }
        } else {
            showToast("无效的标签页链接", "error");
        }
    }

    /** 打开指定组内的所有标签页，并从缓存中移除该组 */
    async function openAllInGroup(originalGroupIndex) {
        const group = groupsCache[originalGroupIndex];
        if (!group?.tabs) { showToast("组数据错误", "error"); return; }
        if (group.tabs.length === 0) { showToast("此组为空", "info"); return; }

        try {
            for (const tab of group.tabs) { // 遍历组内所有标签页
                if (tab?.url && tab.url !== "#") await chrome.tabs.create({ url: tab.url, active: false }); // 在后台打开
            }
            groupsCache.splice(originalGroupIndex, 1); // 从缓存中移除该组
            await syncGroupsDebounced([...groupsCache]); // 同步并重新渲染
            showToast(`已打开 "${escapeHTML(group.customName || group.createTime)}" 组中的 ${group.tabs.length} 个标签`, "success");
        } catch (e) { showToast("打开组内标签页时出错", "error"); }
    }

    /** 删除指定的标签组 */
    async function deleteGroup(originalGroupIndex) {
        const group = groupsCache[originalGroupIndex];
        if (!group) { showToast("无法删除：组不存在", "error"); return; }
        const groupDisplayName = group.customName || group.createTime;
        groupsCache.splice(originalGroupIndex, 1); // 从缓存中移除该组
        await syncGroupsDebounced([...groupsCache]); // 同步并重新渲染
        showToast(`标签组 "${escapeHTML(groupDisplayName)}" 已删除`, "success");
    }

    // ====== 导入/导出 函数 ======

    /**
     * 生成 Markdown 格式的字符串。
     * @param {Array<Object>} groupsToExport - 需要导出的标签组数组。
     * @returns {string} Markdown 格式的文本。
     */
    function generateMarkdown(groupsToExport) {
        if (!Array.isArray(groupsToExport)) return "";
        return groupsToExport.map(group =>
            `### ${escapeHTML(group.customName || group.createTime || '未命名组')}\n` + // 组标题 (H3)
            (group.tabs || []).map(tab => `- [${escapeHTML(tab.title || "未命名标签页")}](${escapeHTML(tab.url || '#')})`).join("\n") // 标签项 (列表)
        ).join("\n\n---\n\n"); // 组之间用分隔线
    }

    /** 导出所有标签组为 Markdown (复制到剪贴板) */
    function exportAllMarkdown() {
        if (groupsCache.length === 0) { showToast("没有内容可导出", "info"); return; }
        const markdownText = generateMarkdown(groupsCache);
        showGenericModal({ // 显示包含 Markdown 文本的模态框
            title: "复制全部标签页 (Markdown)", content: markdownText,
            buttons: [
                { text: '复制到剪贴板', class: 'btn-primary', action: (text) => navigator.clipboard.writeText(text).then(() => showToast("已复制", "success")).catch(() => showToast("复制失败", "error")), closesModal: false },
                { text: '取消', class: '' }
            ]
        });
    }
    /** 导出单个标签组为 Markdown (复制到剪贴板) */
    function exportGroupMarkdown(groupIndex) {
        if (!groupsCache[groupIndex]) { showToast("无法导出：组不存在", "error"); return; }
        const group = groupsCache[groupIndex];
        const markdownText = generateMarkdown([group]);
        showGenericModal({
            title: `复制组 "${escapeHTML(group.customName || group.createTime)}" (Markdown)`, content: markdownText,
            buttons: [
                { text: '复制到剪贴板', class: 'btn-primary', action: (text) => navigator.clipboard.writeText(text).then(() => showToast("已复制", "success")).catch(() => showToast("复制失败", "error")), closesModal: false },
                { text: '取消', class: '' }
            ]
        });
    }

    /**
     * 生成 JSON 格式的字符串。
     * @param {Array<Object>} groupsToExport - 需要导出的标签组数组。
     * @returns {string} JSON 格式的文本。
     */
    function generateJSON(groupsToExport) {
        if (!Array.isArray(groupsToExport)) return "[]";
        // 构造可导出的组对象结构
        const exportableGroups = groupsToExport.map(g => ({
            id: g.id,
            customName: g.customName || g.createTime,
            createTime: g.createTime,
            tabs: (g.tabs || []).map(t => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl }))
        }));
        return JSON.stringify(exportableGroups, null, 2); // 格式化JSON，带缩进
    }
    /**
     * 触发文件下载。
     * @param {string} filename - 下载的文件名。
     * @param {string} content - 文件内容。
     * @param {string} contentType - 文件MIME类型。
     */
    function downloadFile(filename, content, contentType) {
        const element = document.createElement('a');
        element.setAttribute('href', `data:${contentType};charset=utf-8,${encodeURIComponent(content)}`);
        element.setAttribute('download', filename);
        element.style.display = 'none'; // 隐藏元素
        document.body.appendChild(element);
        element.click(); // 模拟点击下载
        document.body.removeChild(element); // 移除元素
        showToast(`${filename} 已开始下载`, "success");
    }
    /** 导出所有标签组为 JSON 文件 */
    function exportAllJSON() {
        if (groupsCache.length === 0) { showToast("没有内容可导出", "info"); return; }
        downloadFile(`Just-OneTab_全部导出JSON_${getFormattedDateTime()}.json`, generateJSON(groupsCache), "application/json");
    }
    /** 导出单个标签组为 JSON 文件 */
    function exportGroupJSON(groupIndex) {
        if (!groupsCache[groupIndex]) { showToast("无法导出：组不存在", "error"); return; }
        const group = groupsCache[groupIndex];
        downloadFile(`Just-OneTab_组导出_${(group.customName || group.createTime || 'group').replace(/[\s:/]+/g, '_')}.json`, generateJSON([group]), "application/json");
    }

    /**
     * 生成 Netscape 书签文件格式的 HTML 字符串。
     * @param {Array<Object>} groupsToExport - 需要导出的标签组数组。
     * @returns {string} HTML 书签格式的文本。
     */
    function generateHTMLBookmarks(groupsToExport) {
        if (!Array.isArray(groupsToExport)) return "";
        let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Just-OneTab导出</TITLE>\n<H1>Just-OneTab导出</H1>\n<DL>\n`;
        groupsToExport.forEach(group => {
            // 将创建时间转换为Unix时间戳 (秒)
            const groupCreateDate = group.createTime ? Math.floor(new Date(group.createTime).getTime() / 1000) : Math.floor(Date.now() / 1000);
            html += `    <DT><H3 ADD_DATE="${groupCreateDate}" LAST_MODIFIED="${Math.floor(Date.now() / 1000)}">${escapeHTML(group.customName || group.createTime)}</H3>\n    <DL>\n`;
            (group.tabs || []).forEach(tab => {
                html += `        <DT><A HREF="${escapeHTML(tab.url || '#')}" ADD_DATE="${groupCreateDate}"${tab.favIconUrl ? ` ICON="${escapeHTML(tab.favIconUrl)}"` : ''}>${escapeHTML(tab.title || "未命名标签页")}</A></DT>\n`;
            });
            html += `    </DL></DT>\n`;
        });
        html += `</DL>\n`;
        return html;
    }
    /** 导出所有标签组为 HTML 书签文件 */
    function exportAllHTML() {
        if (groupsCache.length === 0) { showToast("没有内容可导出", "info"); return; }
        downloadFile(`Just-OneTab_全部导出HTML_${getFormattedDateTime()}.html`, generateHTMLBookmarks(groupsCache), "text/html");
    }
    /** 导出单个标签组为 HTML 书签文件 */
    function exportGroupHTML(groupIndex) {
        if (!groupsCache[groupIndex]) { showToast("无法导出：组不存在", "error"); return; }
        const group = groupsCache[groupIndex];
        downloadFile(`Just-OneTab_组导出_${(group.customName || group.createTime || 'group').replace(/[\s:/]+/g, '_')}.html`, generateHTMLBookmarks([group]), "text/html");
    }

    /**
     * 将解析后的导入组添加到缓存并同步。
     * @param {Array<Object>} parsedGroups - 从文件或文本中解析出的标签组数组。
     * @param {string} importType - 导入类型（"Markdown", "JSON", "HTML"），用于提示消息。
     */
    async function addImportedGroupsToCache(parsedGroups, importType) {
        // 过滤掉无效的组（没有标签页的组）
        const validNewGroups = parsedGroups.filter(g => Array.isArray(g.tabs) && g.tabs.length > 0);
        if (validNewGroups.length > 0) {
            groupsCache.unshift(...validNewGroups); // 将新组添加到缓存开头
            await syncGroupsDebounced([...groupsCache]); // 同步并重新渲染
            showToast(`成功从 ${importType} 导入 ${validNewGroups.reduce((sum, g) => sum + g.tabs.length, 0)} 个标签页，分为 ${validNewGroups.length} 个组`, "success");
        } else {
            showToast(`${importType} 文件中未找到有效的标签组数据，或组内无标签页`, "warning");
        }
    }

    /**
     * 从 Markdown 文本导入标签组。
     * @param {string} markdownText - Markdown 格式的文本。
     */
    async function importMarkdownText(markdownText) {
        if (!markdownText?.trim()) { showToast("Markdown内容为空", "warning"); return; }
        const lines = markdownText.split('\n');
        const newGroupsFromMd = [];
        let currentGroupFromMd = null;
        const importTimestamp = new Date();
        const formattedDate = importTimestamp.toLocaleDateString(); // 获取本地化日期字符串
        let groupCounterForImport = 0; // 用于生成唯一ID

        for (const line of lines) {
            const trimmedLine = line.trim();
            const groupHeaderMatch = trimmedLine.match(/^###\s+(.*)/); // 匹配 H3 标题作为组名
            if (groupHeaderMatch) {
                if (currentGroupFromMd?.tabs?.length > 0) newGroupsFromMd.push(currentGroupFromMd); // 保存上一个组
                // 创建新组，组名固定为 "Markdown导入 [日期]"
                currentGroupFromMd = {
                    id: `imported-md-${importTimestamp.getTime()}-${groupCounterForImport++}`,
                    customName: `Markdown导入 ${formattedDate}`, 
                    createTime: importTimestamp.toLocaleString(), tabs: []
                };
            } else if (trimmedLine.startsWith("- [") && currentGroupFromMd) { // 匹配 Markdown 列表项作为标签页
                const match = trimmedLine.match(/-\s*\[(.*?)\]\((.*?)\)/);
                if (match && match[1] !== undefined && match[2]) { // 确保标题和URL都匹配到
                    currentGroupFromMd.tabs.push({ title: match[1].trim(), url: match[2].trim() || "#", favIconUrl: "" });
                }
            }
        }
        if (currentGroupFromMd?.tabs?.length > 0) newGroupsFromMd.push(currentGroupFromMd); // 保存最后一个组
        await addImportedGroupsToCache(newGroupsFromMd, "Markdown");
        closeMarkdownImportModalUI(); // 关闭导入模态框
    }

    /**
     * 处理文件导入（JSON 或 HTML）。
     * @param {Event} event - 文件输入框的 change 事件对象。
     * @param {string} type - 导入文件类型 ("json" 或 "html")。
     */
    function handleFileImport(event, type) {
        const file = event.target.files?.[0];
        if (!file) { showToast("未选择文件", "info"); return; }
        const reader = new FileReader();
        reader.onload = async (e) => { // 文件读取成功
            const content = e.target.result;
            try {
                if (type === 'json') await importJSONText(content);
                else if (type === 'html') await importHTMLText(content);
            } catch (err) {
                showToast(`导入 ${type.toUpperCase()} 文件失败: ${err.message}`, "error");
            } finally {
                if (DOMElements.fileInput) DOMElements.fileInput.value = ""; // 清空文件输入框，以便再次选择同名文件
            }
        };
        reader.onerror = () => { showToast(`读取文件失败`, "error"); if (DOMElements.fileInput) DOMElements.fileInput.value = ""; };
        reader.readAsText(file); // 以文本形式读取文件内容
    }

    /**
     * 从 JSON 文本导入标签组。
     * @param {string} jsonText - JSON 格式的文本。
     */
    async function importJSONText(jsonText) {
        let importedData;
        try { importedData = JSON.parse(jsonText); } // 解析JSON文本
        catch (e) { showToast("JSON文件格式无效", "error"); console.error("JSON 解析错误:", e); return; }
        if (!Array.isArray(importedData)) { showToast("JSON数据顶层必须是一个数组", "error"); return; }

        const newGroupsFromJson = [];
        const importTimestamp = new Date();
        const formattedDate = importTimestamp.toLocaleDateString(); 
        let groupCounterForImport = 0;
        importedData.forEach((groupFromFile) => {
            // 验证导入的组数据结构
            if (groupFromFile && typeof groupFromFile === 'object' && Array.isArray(groupFromFile.tabs) && groupFromFile.tabs.length > 0) {
                newGroupsFromJson.push({ // 创建新组对象
                    id: groupFromFile.id || `imported-json-${importTimestamp.getTime()}-${groupCounterForImport++}`,
                    customName: `JSON导入 ${formattedDate}`, // 组名固定为 "JSON导入 [日期]"
                    createTime: groupFromFile.createTime || importTimestamp.toLocaleString(),
                    tabs: groupFromFile.tabs.map(tab => ({ // 标准化标签页数据
                        title: tab.title || "未命名标签页", url: tab.url || "#", favIconUrl: tab.favIconUrl || ""
                    }))
                });
            }
        });
        await addImportedGroupsToCache(newGroupsFromJson, "JSON");
    }

    /**
     * 从 HTML 书签文件文本导入标签组。
     * @param {string} htmlText - HTML 格式的文本。
     */
    async function importHTMLText(htmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, "text/html"); // 解析HTML文本
        const newGroupsFromHtml = [];
        const importTimestamp = new Date();
        const formattedDate = importTimestamp.toLocaleDateString();
        let groupCounterForImport = 0;

        // 辅助函数：处理单个 <DL> 元素（代表一个文件夹或书签列表）
        function processDlForImport(dlElement, folderNameFromFile = null) {
            // 从 <DL> 中直接查找 <DT><A HREF="..."> 结构的标签页
            const tabs = Array.from(dlElement.querySelectorAll(':scope > dt > a[href]')).map(a => ({
                title: a.textContent.trim() || "未命名书签", url: a.getAttribute('href'), favIconUrl: a.getAttribute('icon') || ""
            }));
            if (tabs.length > 0) {
                newGroupsFromHtml.push({
                    id: `imported-html-${importTimestamp.getTime()}-${groupCounterForImport++}`,
                    customName: `HTML导入 ${formattedDate}`, // 组名固定为 "HTML导入 [日期]"
                    createTime: importTimestamp.toLocaleString(), tabs
                });
                return true; // 表示成功处理并添加了组
            }
            return false; // 未找到有效标签页
        }

        // 主要逻辑：查找 H3 元素（通常代表文件夹/组名）
        doc.querySelectorAll('h3').forEach(h3 => {
            const groupNameFromH3 = h3.textContent.trim(); // 这是HTML文件中的原始文件夹名，但我们不再使用它作为组名
            // 标准 Netscape 书签格式中，H3 之后紧跟着包含其书签的 DL 元素：<DT><H3>...</H3><DL>...</DL></DT>
            let dlForTabs = h3.nextElementSibling; // H3 的下一个兄弟元素应该是 DL
            if (dlForTabs && dlForTabs.tagName === 'DL') {
                // 传递 groupNameFromH3 仅用于调试或未来可能的扩展，当前 processDlForImport 会忽略它
                processDlForImport(dlForTabs, groupNameFromH3); 
            } else {
                 // 如果 H3 后面没有紧跟 DL，记录一个警告
                 console.warn("HTML Import: Expected DL sibling after H3 not found, or not a DL tag for group:", groupNameFromH3, h3.nextElementSibling);
            }
        });

        // 回退逻辑：如果通过 H3 未找到任何组（例如，扁平的书签文件，没有文件夹结构）
        // 则尝试从顶层 DL 元素解析标签页。
        if (newGroupsFromHtml.length === 0) {
            doc.querySelectorAll('dl').forEach(dl => {
                // 判断此 DL 是否已经被 H3 逻辑处理过
                const parentIsDt = dl.parentElement?.tagName === 'DT';
                const precededByH3InDt = dl.previousElementSibling?.tagName === 'H3' && parentIsDt;

                if (!precededByH3InDt) { // 如果此 DL 不是 H3 文件夹的内容
                    // 进一步判断它是否是根 DL 或非 H3 文件夹的子 DL
                    // 这是一个启发式条件，尝试避免重复处理已作为 H3 子文件夹内容解析的 DL
                    if (!parentIsDt || dl.parentElement?.parentElement?.tagName !== 'DL') {
                         processDlForImport(dl); // 此时 folderNameFromFile 为 null，组名将是 "HTML导入 [日期]"
                    }
                }
            });
        }
        await addImportedGroupsToCache(newGroupsFromHtml, "HTML");
    }

    // ====== 事件绑定 ======
    /**
     * 设置页面上所有主要的事件监听器。
     */
    function setupAllEventListeners() {
        const { // 从 DOMElements 中解构所需元素
            openAllButton, deleteAllButton, exportAllMainBtn, exportAllOptionsMenu,
            exportAllMdItem, exportAllJsonItem, exportAllHtmlItem,
            importMainBtn, importOptionsMenu, importMdItem, importJsonItem, importHtmlItem,
            confirmMdImportBtn, cancelMdImportBtn, searchInput, groupsContainer,
            settingsGearBtn, saveSettingsInModalBtn, closeSettingsModalBtn, fileInput
        } = DOMElements;

        // “全部打开”按钮点击事件
        if (openAllButton) openAllButton.addEventListener("click", async () => {
            if (groupsCache.length === 0) { showToast("没有可打开的标签页", "info"); return; }
            const allTabs = groupsCache.flatMap(group => group.tabs || []); // 获取所有组中的所有标签页
            if (allTabs.length === 0) { showToast("没有可打开的标签页", "info"); return; }
            try {
                for (const tab of allTabs) { if (tab?.url && tab.url !== "#") await chrome.tabs.create({ url: tab.url, active: false }); } // 在后台打开所有标签
                await syncGroupsDebounced([]); // 清空缓存并同步（因为所有标签都已打开并从Just-OneTab中移除）
                showToast(`已打开全部 ${allTabs.length} 个标签页`, "success");
            } catch (e) { console.error("打开全部标签失败:", e); showToast("打开全部标签时出错", "error"); }
        });

        // “全部删除”按钮点击事件
        if (deleteAllButton) deleteAllButton.addEventListener("click", () => {
            if (groupsCache.length === 0) { showToast("没有可删除的标签页", "info"); return; }
            const tabCount = groupsCache.reduce((sum, group) => sum + (group.tabs?.length || 0), 0);
            showGenericModal({ // 显示确认删除的模态框
                title: "确认删除全部", content: `确定要删除所有 ${tabCount} 个标签页吗？`,
                buttons: [
                    { text: '确认删除', class: 'btn-danger', action: async () => { await syncGroupsDebounced([]); showToast("已删除所有标签页", "success"); } },
                    { text: '取消', class: '' }
                ],
                options: { enterConfirms: true, textareaRows: 2 }
            });
        });

        // 头部“导出全部”下拉菜单
        if (exportAllMainBtn && exportAllOptionsMenu) {
            exportAllMainBtn.addEventListener("click", (e) => { e.stopPropagation(); closeAllDropdowns(exportAllOptionsMenu); exportAllOptionsMenu.classList.toggle("show"); });
        }
        exportAllMdItem?.addEventListener("click", () => { exportAllMarkdown(); closeAllDropdowns(); });
        exportAllJsonItem?.addEventListener("click", () => { exportAllJSON(); closeAllDropdowns(); });
        exportAllHtmlItem?.addEventListener("click", () => { exportAllHTML(); closeAllDropdowns(); });

        // 头部“导入”下拉菜单
        if (importMainBtn && importOptionsMenu) {
            importMainBtn.addEventListener("click", (e) => { e.stopPropagation(); closeAllDropdowns(importOptionsMenu); importOptionsMenu.classList.toggle("show"); });
        }
        importMdItem?.addEventListener("click", () => { showMarkdownImportModalUI(); closeAllDropdowns(); }); // 从Markdown导入
        importJsonItem?.addEventListener("click", () => { // 从JSON导入
            if (fileInput) { fileInput.accept = ".json"; fileInput.onchange = (e) => handleFileImport(e, 'json'); fileInput.click(); }
            closeAllDropdowns();
        });
        importHtmlItem?.addEventListener("click", () => { // 从HTML导入
            if (fileInput) { fileInput.accept = ".html,.htm"; fileInput.onchange = (e) => handleFileImport(e, 'html'); fileInput.click(); }
            closeAllDropdowns();
        });

        // Markdown导入模态框按钮
        confirmMdImportBtn?.addEventListener("click", () => { if (DOMElements.markdownPasteArea) importMarkdownText(DOMElements.markdownPasteArea.value); });
        cancelMdImportBtn?.addEventListener("click", closeMarkdownImportModalUI);
        
        // 搜索框输入事件（防抖处理）
        searchInput?.addEventListener("input", debounce(() => renderGroups(), 300));
        
        // 标签组容器点击事件（事件委托，处理标签项点击和关闭按钮点击）
        groupsContainer?.addEventListener("click", (event) => {
            if (event.target.closest(".tab-item") && !event.target.closest('.group-name-input')) handleTabClick(event);
        });

        // 设置相关按钮
        settingsGearBtn?.addEventListener('click', openSettingsModal); // 打开设置模态框
        saveSettingsInModalBtn?.addEventListener('click', async () => { if (await saveSettingsFromModal()) closeSettingsModal(); }); // 保存设置模态框中的更改
        closeSettingsModalBtn?.addEventListener('click', closeSettingsModal); // 关闭设置模态框
    }

    // ====== 初始化流程 ======
    await loadAndApplyInitialSettings(); // 加载并应用用户设置
    setupAllEventListeners(); // 设置所有事件监听器
    await loadGroupsFromStorage(); // 从存储加载标签组数据并首次渲染
});