document.addEventListener("DOMContentLoaded", () => {
    let groupsCache = [];
    let syncTimeout;
    let isSyncing = false;

    // ====== 辅助工具函数 ======
    const debounce = (fn, delay = 300) => {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    };

    const filterGroupsBySearchTerm = (groups, searchTerm) => {
        return groups
            .map((group) => ({
                ...group,
                tabs: group.tabs.filter(
                    (tab) =>
                        tab.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        tab.url.toLowerCase().includes(searchTerm.toLowerCase())
                ),
            }))
            .filter((group) => group.tabs.length > 0);
    };

    const highlightText = (text, keyword) => {
        if (!keyword) return text; // 如果没有关键字，返回原始内容
        const regex = new RegExp(`(${keyword})`, "gi"); // 匹配所有关键字（忽略大小写）
        return text.replace(regex, `<span class="highlight">$1</span>`); // 用 <span> 包裹关键字以实现高亮
    };

    // ====== 消息监听：后台数据更新 ======
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "update" && message.groups) {
            groupsCache = message.groups;
            renderGroups();
            sendResponse({ success: true });
        }
    });

    // ====== 防抖同步函数 ======
    async function syncGroupsDebounced(updatedGroups) {
        clearTimeout(syncTimeout);
    
        syncTimeout = setTimeout(async () => {
            if (isSyncing) return; // 如果正在同步则跳过
            isSyncing = true; // 加锁
    
            try {
                groupsCache = updatedGroups;
                await chrome.storage.local.set({ savedTabsGroups: updatedGroups });
                renderGroups(); // 成功时刷新页面
            } catch (error) {
                console.error("同步失败：", error);
            } finally {
                isSyncing = false; // 释放锁
            }
        }, 300);
    }

    // ====== 加载数据 ======
    async function loadGroups() {
        const data = await chrome.storage.local.get("savedTabsGroups");
        groupsCache = data.savedTabsGroups || [];
        renderGroups();
    }

    // ====== 显示模态弹窗 ======
    function showModal(title, content) {
        const modal = document.createElement("div");
        modal.className = "modal-container";

        modal.innerHTML = `
            <div class="modal">
                <h3>${title}</h3>
                <textarea readonly>${content}</textarea>
                <div class="modal-buttons">
                    <button id="copyButton" class="btn">复制到剪贴板</button>
                    <button id="closeButton" class="btn btn-danger">关闭 ( ESC )</button>
                </div>
            </div>
        `;

        function closeModal() {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
                document.removeEventListener("keydown", escListener); // 移除键盘监听事件
            }
        }

        const escListener = (e) => {
            if (e.key === "Escape") closeModal();
        };

        document.body.appendChild(modal);
        document.addEventListener("keydown", escListener);

        modal.querySelector("#copyButton").addEventListener("click", () => {
            navigator.clipboard.writeText(content).then(() => {
                showToast("已复制到剪贴板😊", "success");
            }).catch((err) => {
                showToast("复制失败，请重试！", "error");
                console.error(err);
            });
        });

        modal.querySelector("#closeButton").addEventListener("click", closeModal);
    }

    // ====== 提示弹窗 ======
    function showToast(message, type = "success") {
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            setTimeout(() => document.body.removeChild(toast), 500);
        }, 3000);
    }

    // ====== 分享组内容 ======
    function shareGroupAsMarkdown(groupIndex) {
        const group = groupsCache[groupIndex];
        const markdownText = [
            `### 标签组时间：${group.createTime}`,
            ...group.tabs.map((tab) => `- [${tab.title || "未命名标签页"}](${tab.url})`),
        ].join("\n");
        showModal("分享本组标签页（Markdown格式）", markdownText);
    }

    // ====== 渲染页面 ======
    function renderGroups(customGroups = null) {
        const container = document.getElementById("groups-container");
        container.innerHTML = "";

        const fragment = document.createDocumentFragment(); // 减少DOM操作
        const groupsToRender = customGroups || groupsCache;

        const tabCount = groupsToRender.reduce((sum, group) => sum + group.tabs.length, 0);
        document.getElementById("tab-count").textContent = `( 当前共 ${tabCount} 个标签页 )`;

        groupsToRender.forEach((group, index) => {
            fragment.appendChild(renderGroup(group, index));
        });

        container.appendChild(fragment);
    }

    function renderGroup(group, groupIndex) {
        const groupElement = document.createElement("div");
        groupElement.className = "group";

        const groupHeader = document.createElement("div");
        groupHeader.className = "group-header";
        groupHeader.innerHTML = `
            <div class="group-title">
                <h2>${group.createTime}&nbsp;&nbsp;&nbsp;(${group.tabs.length} 个标签页)</h2>
            </div>
            <div class="group-actions">
                <button class="group-open-all">打开组</button>
                <button class="group-delete">删除组</button>
                <button class="group-export">分享组</button>
            </div>
        `;
        const tabsList = document.createElement("div");
        tabsList.className = "tabs-list";

        const searchTerm = document.getElementById("searchInput").value.toLowerCase();

        group.tabs.forEach((tab, tabIndex) => {
            const tabElement = document.createElement("div");
            tabElement.className = "tab-item";
            tabElement.dataset.groupIndex = groupIndex;
            tabElement.dataset.tabIndex = tabIndex;

            // 使用高亮函数为标题和 URL 添加高亮效果
            const highlightedTitle = highlightText(tab.title, searchTerm);
            const highlightedUrl = highlightText(tab.url, searchTerm);

            tabElement.innerHTML = `
                <img src="${tab.favIconUrl || "../images/default-icon.png"}" alt="" class="favicon">
                <div class="tab-info">
                    <div class="tab-title">${highlightedTitle}</div>
                    <div class="tab-url">${highlightedUrl}</div>
                </div>
                <button class="tab-close" data-group-index="${groupIndex}" data-tab-index="${tabIndex}">×</button>
            `;
            tabsList.appendChild(tabElement);
        });

        groupElement.appendChild(groupHeader);
        groupElement.appendChild(tabsList);

        groupHeader.querySelector(".group-open-all").addEventListener("click", () => openAllInGroup(groupIndex));
        groupHeader.querySelector(".group-delete").addEventListener("click", () => deleteGroup(groupIndex));
        groupHeader.querySelector(".group-export").addEventListener("click", () => shareGroupAsMarkdown(groupIndex));

        return groupElement;
    }

    // ====== 点击标签处理 ======
    async function handleTabClick(event) {
        const tabElement = event.target.closest(".tab-item");
        if (!tabElement) return;

        const groupIndex = parseInt(tabElement.dataset.groupIndex, 10);
        const tabIndex = parseInt(tabElement.dataset.tabIndex, 10);
        const tab = groupsCache[groupIndex].tabs[tabIndex];

        if (event.target.classList.contains("tab-close")) {
            groupsCache[groupIndex].tabs.splice(tabIndex, 1);
            if (groupsCache[groupIndex].tabs.length === 0) groupsCache.splice(groupIndex, 1);
            await syncGroupsDebounced(groupsCache);
        } else {
            await chrome.tabs.create({ url: tab.url });
            groupsCache[groupIndex].tabs.splice(tabIndex, 1);
            if (groupsCache[groupIndex].tabs.length === 0) groupsCache.splice(groupIndex, 1);
            await syncGroupsDebounced(groupsCache);
        }
    }

    // ====== 分组操作 ======
    async function openAllInGroup(groupIndex) {
        const tabs = groupsCache[groupIndex].tabs;
        await Promise.all(tabs.map((tab) => chrome.tabs.create({ url: tab.url })));
        groupsCache.splice(groupIndex, 1);
        await syncGroupsDebounced(groupsCache);
    }

    async function deleteGroup(groupIndex) {
        groupsCache.splice(groupIndex, 1);
        await syncGroupsDebounced(groupsCache);
    }

    // ====== 搜索功能 ======
    document.getElementById("searchInput").addEventListener(
        "input",
        debounce((e) => {
            const searchTerm = e.target.value;
            const filteredGroups = filterGroupsBySearchTerm(groupsCache, searchTerm);
            renderGroups(filteredGroups);
        })
    );

    // ====== 初始化事件绑定 ======
    document.getElementById("groups-container").addEventListener("click", handleTabClick);
    document.getElementById("open-all").addEventListener("click", async () => {
        const allTabs = groupsCache.flatMap((group) => group.tabs);
        await Promise.all(allTabs.map((tab) => chrome.tabs.create({ url: tab.url })));
        await syncGroupsDebounced([]);
    });

    document.getElementById("delete-all").addEventListener("click", async () => syncGroupsDebounced([]));

    document.getElementById("export-all").addEventListener("click", () => {
        const markdownText = groupsCache
            .map(
                (group) =>
                    `### 标签组时间：${group.createTime}\n` +
                    group.tabs.map((tab) => `- [${tab.title || "未命名标签页"}](${tab.url})`).join("\n")
            )
            .join("\n\n");
        showModal("分享全部标签页（Markdown格式）", markdownText);
    });

    loadGroups();
});