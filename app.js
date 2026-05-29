// ============================================
// 极简记账系统 v5 - 智能收支识别 + 收支切换
// ============================================

class AccountingApp {
    constructor() {
        this.records = this.loadRecords();
        this.goal = this.loadGoal();
        this.customCategories = this.loadCustomCategories();
        this.llmConfig = this.loadLLMConfig();
        this.currentTab = 'bookkeeping';
        this.manualType = null; // null=自动, 'income', 'expense'

        this.periodMode = 'month';
        this.periodDate = new Date();

        this.chartFilter = 'month';
        this.pieChartExpense = null;
        this.pieChartIncome = null;
        this.lineChart = null;

        // 默认分类
        this.defaultCategories = {
            '餐饮': { icon: '🍲', color: '#FF9500', type: 'expense', keywords: ['饭','餐','吃','麦当劳','肯德基','外卖','食堂','早餐','午餐','晚餐','夜宵','小吃','奶茶','咖啡','面','米','粉','火锅','烧烤','日料','面包','蛋糕'] },
            '交通': { icon: '🚗', color: '#007AFF', type: 'expense', keywords: ['地铁','公交','打车','出租','加油','停车','高铁','火车','飞机','机票','车票','滴滴'] },
            '购物': { icon: '🛍', color: '#FF2D55', type: 'expense', keywords: ['买','购','淘宝','京东','天猫','拼多多','衣服','鞋','包','手机','数码'] },
            '娱乐': { icon: '🎮', color: '#5856D6', type: 'expense', keywords: ['电影','游戏','KTV','唱歌','旅游','景点','门票','演出','酒吧','会员'] },
            '居住': { icon: '🏠', color: '#8E8E93', type: 'expense', keywords: ['房租','水电','物业','维修','租金','电费','水费','燃气','网费'] },
            '医疗': { icon: '💊', color: '#34C759', type: 'expense', keywords: ['药','医院','看病','体检','挂号','牙科','诊所'] },
            '教育': { icon: '📚', color: '#AF52DE', type: 'expense', keywords: ['书','课程','培训','学费','考试','学习'] },
            '其他': { icon: '📦', color: '#AEAEB2', type: 'expense', keywords: [] },
            '工资': { icon: '💰', color: '#34C759', type: 'income', keywords: ['工资','薪水','奖金','提成','报销','收入','礼金','投资','退款','分红','到账','收到','转账','红包','补贴','津贴','稿费','租金','利息','理财'] },
            '兼职': { icon: '💵', color: '#30D158', type: 'income', keywords: ['兼职','副业','外快','打零工','收入'] },
            '转账': { icon: '💳', color: '#5AC8FA', type: 'income', keywords: ['转账','红包','收款','转入','收入'] },
        };

        this.buildCategories();
        this.init();
    }

    // ========== 构建有效分类 ==========
    buildCategories() {
        this.categories = {};
        for (const [name, cfg] of Object.entries(this.defaultCategories)) {
            this.categories[name] = { ...cfg };
        }
        for (const cat of this.customCategories) {
            this.categories[cat.name] = {
                icon: cat.icon,
                color: cat.color,
                type: cat.type,
                keywords: cat.keywords || []
            };
        }
    }

    getExpenseCategories() {
        const result = [];
        const seen = new Set();
        for (const cat of this.customCategories) {
            if (cat.type === 'expense' && !seen.has(cat.name)) {
                seen.add(cat.name);
                result.push({ ...cat, isDefault: false });
            }
        }
        for (const [name, cfg] of Object.entries(this.defaultCategories)) {
            if (cfg.type === 'expense' && !seen.has(name)) {
                seen.add(name);
                result.push({ name, icon: cfg.icon, color: cfg.color, type: 'expense', keywords: cfg.keywords || [], isDefault: true });
            }
        }
        return result;
    }

    getIncomeCategories() {
        const result = [];
        const seen = new Set();
        for (const cat of this.customCategories) {
            if (cat.type === 'income' && !seen.has(cat.name)) {
                seen.add(cat.name);
                result.push({ ...cat, isDefault: false });
            }
        }
        for (const [name, cfg] of Object.entries(this.defaultCategories)) {
            if (cfg.type === 'income' && !seen.has(name)) {
                seen.add(name);
                result.push({ name, icon: cfg.icon, color: cfg.color, type: 'income', keywords: cfg.keywords || [], isDefault: true });
            }
        }
        return result;
    }

    // ========== 初始化 ==========
    init() {
        this.bindEvents();
        this.updatePeriodLabel();
        this.renderAll();
        this.checkVoiceSupport();
        this.updateTypeToggle();
    }

    // ========== 事件绑定 ==========
    bindEvents() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => this.switchTab(item.dataset.tab));
        });

        document.getElementById('submit-btn').addEventListener('click', () => this.handleInput());
        document.getElementById('input-field').addEventListener('keypress', e => {
            if (e.key === 'Enter') this.handleInput();
        });
        document.getElementById('input-field').addEventListener('input', e => this.previewInput(e.target.value));

        document.getElementById('voice-btn').addEventListener('click', () => this.startVoiceInput());

        // 收支切换
        document.getElementById('type-expense').addEventListener('click', () => this.setManualType('expense'));
        document.getElementById('type-income').addEventListener('click', () => this.setManualType('income'));
        document.getElementById('type-auto').addEventListener('click', () => this.setManualType(null));

        document.getElementById('period-prev').addEventListener('click', () => this.changePeriod(-1));
        document.getElementById('period-next').addEventListener('click', () => this.changePeriod(1));
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchPeriodMode(btn.dataset.mode));
        });

        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => this.switchChartFilter(chip.dataset.filter));
        });

        document.getElementById('goal-submit-btn').addEventListener('click', () => this.setGoal());
        document.getElementById('goal-input').addEventListener('keypress', e => {
            if (e.key === 'Enter') this.setGoal();
        });

        // 管理分类
        document.getElementById('manage-cats-btn').addEventListener('click', () => this.openCategoryManager());
        document.getElementById('cat-modal-overlay').addEventListener('click', e => {
            if (e.target === e.currentTarget) this.closeCategoryManager();
        });
        document.getElementById('cat-modal-close').addEventListener('click', () => this.closeCategoryManager());
        document.querySelectorAll('.cat-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchCatTab(btn.dataset.catTab));
        });
        document.getElementById('add-cat-btn').addEventListener('click', () => this.showCatEditForm());
        document.getElementById('cat-form-cancel').addEventListener('click', () => this.hideCatEditForm());
        document.getElementById('cat-form-save').addEventListener('click', () => this.saveCatForm());

        // 设置面板
        document.getElementById('settings-gear-btn').addEventListener('click', () => this.openSettings());
        document.getElementById('settings-overlay').addEventListener('click', e => {
            if (e.target === e.currentTarget) this.closeSettings();
        });
        document.getElementById('settings-close').addEventListener('click', () => this.closeSettings());
        document.getElementById('settings-save-btn').addEventListener('click', () => this.saveLLMConfig());
        document.getElementById('settings-test-btn').addEventListener('click', () => this.testLLMConnection());
        document.getElementById('llm-provider-select').addEventListener('change', e => this.onLLMProviderChange(e.target.value));
        document.getElementById('settings-export-btn').addEventListener('click', () => this.exportData());
        document.getElementById('settings-import-btn').addEventListener('click', () => this.importData());
        document.getElementById('settings-clear-btn').addEventListener('click', () => this.clearAllData());

        // 财务健康评估卡片展开/收起
        document.getElementById('health-header').addEventListener('click', () => {
            document.getElementById('health-card').classList.toggle('expanded');
        });
    }

    // ========== 收支类型切换 ==========
    setManualType(type) {
        this.manualType = type;
        this.updateTypeToggle();
        this.renderQuickCats(); // 联动切换快速分类胶囊
        this.previewInput(document.getElementById('input-field').value);
    }

    updateTypeToggle() {
        const autoBtn = document.getElementById('type-auto');
        const expBtn = document.getElementById('type-expense');
        const incBtn = document.getElementById('type-income');
        if (autoBtn) autoBtn.classList.toggle('active', this.manualType === null);
        if (expBtn) expBtn.classList.toggle('active', this.manualType === 'expense');
        if (incBtn) incBtn.classList.toggle('active', this.manualType === 'income');
    }

    // ========== Tab 切换 ==========
    switchTab(tabName) {
        this.currentTab = tabName;
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(ni => ni.classList.remove('active'));
        const target = document.getElementById(`tab-${tabName}`);
        const navBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (target) target.classList.add('active');
        if (navBtn) navBtn.classList.add('active');
        if (tabName === 'charts') this.renderCharts();
        if (tabName === 'planner') this.renderHealthCard();
    }

    // ========== 全面渲染 ==========
    renderAll() {
        this.renderHeaderBalance();
        this.renderSummaryCards();
        this.renderQuickCats();
        this.renderGroupedRecords();
        if (this.currentTab === 'charts') this.renderCharts();
        this.renderGoalStatus();
        this.renderHealthCard();
    }

    renderHeaderBalance() {
        const { income, expense } = this.getPeriodStats();
        const balance = income - expense;
        document.getElementById('header-balance').textContent = '¥ ' + balance.toFixed(2);
    }

    renderSummaryCards() {
        const { income, expense } = this.getPeriodStats();
        const balance = income - expense;
        document.getElementById('summary-income').textContent = '¥ ' + income.toFixed(2);
        document.getElementById('summary-expense').textContent = '¥ ' + expense.toFixed(2);
        document.getElementById('summary-balance').textContent = '¥ ' + balance.toFixed(2);
    }

    // ========== 快速分类胶囊 ==========
    renderQuickCats(type) {
        // type: 'expense' | 'income' | undefined（自动判断）
        var container = document.getElementById('quick-cats');
        var targetType = type || this.manualType || 'expense';
        var cats = targetType === 'income' ? this.getIncomeCategories() : this.getExpenseCategories();
        container.innerHTML = cats.map(function(cat) {
            var shortName = cat.name.length > 4 ? cat.name.slice(0, 4) + '…' : cat.name;
            return '<button class="cat-chip" data-cat="' + cat.name + '" data-type="' + (cat.type || targetType) + '">' + cat.icon + ' ' + shortName + '</button>';
        }).join('');
        container.querySelectorAll('.cat-chip').forEach(function(chip) {
            chip.addEventListener('click', function(e) { app.quickAdd(e.currentTarget.dataset.cat); });
        });
    }

    // ========== 时间选择器 ==========
    switchPeriodMode(mode) {
        this.periodMode = mode;
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-mode="' + mode + '"]').classList.add('active');
        this.updatePeriodLabel();
        this.renderAll();
    }

    changePeriod(delta) {
        if (this.periodMode === 'month') {
            this.periodDate = new Date(this.periodDate.getFullYear(), this.periodDate.getMonth() + delta, 1);
        } else {
            this.periodDate = new Date(this.periodDate.getFullYear() + delta, 0, 1);
        }
        var now = new Date();
        if (this.periodDate.getFullYear() > now.getFullYear()) return;
        if (this.periodMode === 'month' && (
            this.periodDate.getFullYear() === now.getFullYear() &&
            this.periodDate.getMonth() > now.getMonth()
        )) return;
        this.updatePeriodLabel();
        this.renderAll();
    }

    updatePeriodLabel() {
        var el = document.getElementById('period-label');
        if (this.periodMode === 'month') {
            el.textContent = this.periodDate.getFullYear() + '年 ' + (this.periodDate.getMonth() + 1) + '月';
        } else {
            el.textContent = this.periodDate.getFullYear() + '年';
        }
    }

    getPeriodStats() {
        var start, end;
        if (this.periodMode === 'month') {
            var y = this.periodDate.getFullYear();
            var m = this.periodDate.getMonth();
            start = new Date(y, m, 1).getTime();
            end   = new Date(y, m + 1, 1).getTime();
        } else {
            var y = this.periodDate.getFullYear();
            start = new Date(y, 0, 1).getTime();
            end   = new Date(y + 1, 0, 1).getTime();
        }
        var filtered = this.records.filter(function(r) {
            var t = new Date(r.date).getTime();
            return t >= start && t < end;
        });
        var income  = filtered.filter(function(r) { return r.type === 'income'; }).reduce(function(s, r) { return s + r.amount; }, 0);
        var expense = filtered.filter(function(r) { return r.type === 'expense'; }).reduce(function(s, r) { return s + Math.abs(r.amount); }, 0);
        return { income: income, expense: expense, records: filtered };
    }

    // ========== 按日期分组 ==========
    renderGroupedRecords() {
        var container = document.getElementById('records-grouped');
        var stats = this.getPeriodStats();
        var records = stats.records;
        if (records.length === 0) {
            container.innerHTML = '<div class="empty-records">暂无记录<br>开始记账吧</div>';
            return;
        }
        var groups = {};
        records.forEach(function(r) {
            var d = new Date(r.date);
            var key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });
        var sortedDates = Object.keys(groups).sort(function(a, b) { return b.localeCompare(a); });
        var self = this;
        container.innerHTML = sortedDates.map(function(dateStr) {
            var groupRecords = groups[dateStr];
            var dateTotal = groupRecords.reduce(function(s, r) { return s + (r.type === 'expense' ? -Math.abs(r.amount) : r.amount); }, 0);
            var dateObj = new Date(dateStr + 'T00:00:00');
            var weekday = ['周日','周一','周二','周三','周四','周五','周六'][dateObj.getDay()];
            var today = new Date(); today.setHours(0,0,0,0);
            var yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
            var d = new Date(dateStr + 'T00:00:00'); d.setHours(0,0,0,0);
            var dateLabel;
            if (d.getTime() === today.getTime()) dateLabel = '今天';
            else if (d.getTime() === yesterday.getTime()) dateLabel = '昨天';
            else dateLabel = (dateObj.getMonth()+1) + '月' + dateObj.getDate() + '日 ' + weekday;
            return '<div class="record-date-group">' +
                '<div class="record-date-header">' +
                    '<span class="date-label">' + dateLabel + '</span>' +
                    '<span class="date-total">' + (dateTotal >= 0 ? '+' : '') + '\u00A5' + dateTotal.toFixed(2) + '</span>' +
                '</div>' +
                groupRecords.map(function(r) { return self.renderRecordItem(r); }).join('') +
            '</div>';
        }).join('');
        container.querySelectorAll('.record-delete').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                self.deleteRecord(Number(btn.dataset.id));
            });
        });
    }

    renderRecordItem(r) {
        var cfg = this.categories[r.category] || this.categories['其他'];
        var d = new Date(r.date);
        var timeStr = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
        var color = cfg.color || '#8E8E93';
        return '<div class="record-item">' +
            '<div class="record-icon" style="background:' + color + '20;color:' + color + '">' + cfg.icon + '</div>' +
            '<div class="record-info">' +
                '<div class="record-category">' + timeStr + ' \u00B7 ' + r.category + '</div>' +
                '<div class="record-desc" title="' + r.desc + '">' + r.desc + '</div>' +
            '</div>' +
            '<div class="record-amount ' + r.type + '">' +
                (r.type === 'expense' ? '-' : '+') + Math.abs(r.amount).toFixed(2) +
            '</div>' +
            '<button class="record-delete" data-id="' + r.id + '">&times;</button>' +
        '</div>';
    }

    // ========== 处理输入 ==========
    handleInput() {
        var input = document.getElementById('input-field').value.trim();
        if (!input) return;
        var record = this.parseInput(input);
        if (record) {
            this.addRecord(record);
            document.getElementById('input-field').value = '';
            document.getElementById('preview').classList.add('hidden');
        }
    }

    parseInput(input) {
        var amountMatch = input.match(/(\d+\.?\d*)\s*(块|元|￥|¥)?/);
        if (!amountMatch) {
            this.showPreview('未识别到金额，请包含数字');
            return null;
        }
        var amount = parseFloat(amountMatch[1]);
        var desc = input.replace(/(\d+\.?\d*\s*(块|元|￥|¥)?)/, '').trim();
        if (!desc) desc = input.replace(/(\d+\.?\d*)/, '').trim() || '未命名';
        var category = this.autoClassify(desc);
        var type = this.manualType || (this.isIncome(desc) ? 'income' : 'expense');
        return {
            id: Date.now(),
            desc: desc,
            amount: type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
            type: type,
            category: category,
            date: new Date().toISOString(),
            timestamp: Date.now()
        };
    }

    autoClassify(desc) {
        var d = desc.toLowerCase();
        for (var i = 0; i < this.customCategories.length; i++) {
            var cat = this.customCategories[i];
            if (cat.keywords && cat.keywords.some(function(kw) { return d.indexOf(kw) !== -1; })) {
                return cat.name;
            }
        }
        var keys = Object.keys(this.defaultCategories);
        for (var j = 0; j < keys.length; j++) {
            var name = keys[j];
            var cfg = this.defaultCategories[name];
            if (this.customCategories.some(function(c) { return c.name === name; })) continue;
            if (cfg.keywords && cfg.keywords.some(function(kw) { return d.indexOf(kw) !== -1; })) {
                return name;
            }
        }
        return '其他';
    }

    isIncome(desc) {
        var d = desc.toLowerCase();
        // 收入专属关键词
        var incomeKeywords = ['收入','工资','奖金','兼职','礼金','投资','退款','报销','分红','到账','收到','转账','红包','补贴','津贴','稿费','租金','利息','理财','回款','中奖','返现','返利','提成','副业','外快'];
        for (var i = 0; i < incomeKeywords.length; i++) {
            if (d.indexOf(incomeKeywords[i]) !== -1) return true;
        }
        // 支出专属关键词（明确表示支出的）
        var expenseKeywords = ['买了','花了','支付','消费','购买','支出','开销','花费','付款','充值','缴费','还贷','还信用卡','扣款','扣费'];
        for (var j = 0; j < expenseKeywords.length; j++) {
            if (d.indexOf(expenseKeywords[j]) !== -1) return false;
        }
        // 检查自定义收入分类关键词
        for (var k = 0; k < this.customCategories.length; k++) {
            var cat = this.customCategories[k];
            if (cat.type === 'income' && cat.keywords && cat.keywords.some(function(kw) { return d.indexOf(kw) !== -1; })) return true;
        }
        // 检查默认收入分类关键词
        var keys = Object.keys(this.defaultCategories);
        for (var m = 0; m < keys.length; m++) {
            var name = keys[m];
            var cfg = this.defaultCategories[name];
            if (this.customCategories.some(function(c) { return c.name === name; })) continue;
            if (cfg.type === 'income' && cfg.keywords && cfg.keywords.some(function(kw) { return d.indexOf(kw) !== -1; })) return true;
        }
        return false;
    }

    previewInput(input) {
        var preview = document.getElementById('preview');
        if (!input) { preview.classList.add('hidden'); return; }
        var record = this.parseInput(input);
        if (record) {
            var cfg = this.categories[record.category] || this.categories['其他'];
            var typeLabel = record.type === 'income' ? '收入' : '支出';
            var typeColor = record.type === 'income' ? 'var(--income)' : 'var(--expense)';
            preview.innerHTML = '<div class="preview-row">' +
                '<span class="preview-icon">' + cfg.icon + '</span>' +
                '<div class="preview-info">' +
                    '<div class="preview-desc">' + record.desc + '</div>' +
                    '<div class="preview-amount ' + record.type + '">' +
                        (record.type === 'expense' ? '-' : '+') + Math.abs(record.amount).toFixed(2) +
                    '</div>' +
                    '<div class="preview-cat">分类：' + record.category + ' · <span style="color:' + typeColor + ';font-weight:600">' + typeLabel + '</span></div>' +
                '</div>' +
            '</div>';
            preview.classList.remove('hidden');
        }
    }

    showPreview(msg) {
        var preview = document.getElementById('preview');
        preview.innerHTML = '<div style="color:var(--expense);font-size:14px;">' + msg + '</div>';
        preview.classList.remove('hidden');
    }

    quickAdd(category) {
        var input = document.getElementById('input-field');
        input.value = category + ' ';
        input.focus();
        document.querySelectorAll('.cat-chip').forEach(function(c) { c.classList.remove('active'); });
        var chip = document.querySelector('[data-cat="' + category + '"]');
        if (chip) chip.classList.add('active');
    }

    addRecord(record) {
        this.records.unshift(record);
        this.saveRecords();
        this.renderAll();
        if (navigator.vibrate) navigator.vibrate(50);
    }

    deleteRecord(id) {
        this.records = this.records.filter(function(r) { return r.id !== id; });
        this.saveRecords();
        this.renderAll();
    }

    // ========== 图表 ==========
    switchChartFilter(filter) {
        this.chartFilter = filter;
        document.querySelectorAll('.filter-chip').forEach(function(c) { c.classList.remove('active'); });
        document.querySelector('[data-filter="' + filter + '"]').classList.add('active');
        this.renderCharts();
    }

    renderCharts() {
        this.renderPieChart();
        this.renderLineChart();
        this.renderRanking();
    }

    getChartTimeRange() {
        var now = new Date();
        var start;
        if (this.chartFilter === 'week') {
            var day = now.getDay() || 7;
            start = new Date(now); start.setDate(now.getDate() - day + 1);
            start.setHours(0,0,0,0);
        } else if (this.chartFilter === 'month') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
        } else {
            start = new Date(now.getFullYear(), 0, 1);
        }
        return { start: start.getTime(), end: now.getTime() + 86400000 };
    }

    renderPieChart() {
        var range = this.getChartTimeRange();
        var start = range.start, end = range.end;

        // 支出饼图
        var expenses = this.records.filter(function(r) {
            var t = new Date(r.date).getTime();
            return t >= start && t < end && r.type === 'expense';
        });
        var expenseCtx = document.getElementById('pie-chart-expense').getContext('2d');
        if (this.pieChartExpense) this.pieChartExpense.destroy();
        if (expenses.length === 0) {
            this.pieChartExpense = new Chart(expenseCtx, {
                type: 'doughnut',
                data: { labels: ['暂无数据'], datasets: [{ data: [1], backgroundColor: ['#E5E5EA'] }] },
                options: { plugins: { legend: { display: false } } }
            });
        } else {
            var catMap = {};
            expenses.forEach(function(r) { catMap[r.category] = (catMap[r.category] || 0) + Math.abs(r.amount); });
            var entries = Object.entries(catMap).sort(function(a, b) { return b[1] - a[1]; });
            var labels = entries.map(function(e) { return e[0]; });
            var data = entries.map(function(e) { return Math.round(e[1] * 100) / 100; });
            var self = this;
            var bgColors = entries.map(function(e) {
                var cfg = self.categories[e[0]]; return cfg ? cfg.color : '#8E8E93';
            });
            this.pieChartExpense = new Chart(expenseCtx, {
                type: 'doughnut',
                data: { labels: labels, datasets: [{ data: data, backgroundColor: bgColors, borderWidth: 0, hoverBorderWidth: 2, hoverBorderColor: '#fff' }] },
                options: {
                    cutout: '62%',
                    plugins: {
                        legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { family: '-apple-system', size: 12 }, color: '#86868B' } },
                        tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.label + ': ¥' + ctx.raw.toFixed(2); } } }
                    }
                }
            });
        }

        // 收入饼图
        var incomes = this.records.filter(function(r) {
            var t = new Date(r.date).getTime();
            return t >= start && t < end && r.type === 'income';
        });
        var incomeCtx = document.getElementById('pie-chart-income').getContext('2d');
        if (this.pieChartIncome) this.pieChartIncome.destroy();
        if (incomes.length === 0) {
            this.pieChartIncome = new Chart(incomeCtx, {
                type: 'doughnut',
                data: { labels: ['暂无数据'], datasets: [{ data: [1], backgroundColor: ['#E5E5EA'] }] },
                options: { plugins: { legend: { display: false } } }
            });
        } else {
            var catMap2 = {};
            incomes.forEach(function(r) { catMap2[r.category] = (catMap2[r.category] || 0) + r.amount; });
            var entries2 = Object.entries(catMap2).sort(function(a, b) { return b[1] - a[1]; });
            var labels2 = entries2.map(function(e) { return e[0]; });
            var data2 = entries2.map(function(e) { return Math.round(e[1] * 100) / 100; });
            var self2 = this;
            var bgColors2 = entries2.map(function(e) {
                var cfg = self2.categories[e[0]]; return cfg ? cfg.color : '#8E8E93';
            });
            this.pieChartIncome = new Chart(incomeCtx, {
                type: 'doughnut',
                data: { labels: labels2, datasets: [{ data: data2, backgroundColor: bgColors2, borderWidth: 0, hoverBorderWidth: 2, hoverBorderColor: '#fff' }] },
                options: {
                    cutout: '62%',
                    plugins: {
                        legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { family: '-apple-system', size: 12 }, color: '#86868B' } },
                        tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.label + ': ¥' + ctx.raw.toFixed(2); } } }
                    }
                }
            });
        }
    }

    renderLineChart() {
        if (this.lineChart) this.lineChart.destroy();
        var now = new Date();
        var months = [], incomeData = [], expenseData = [];
        for (var i = 5; i >= 0; i--) {
            var m = now.getMonth() + 1 - i, y = now.getFullYear();
            if (m < 1) { m += 12; y--; }
            months.push(m + '月');
            var ms = new Date(y, m - 1, 1).getTime(), me = new Date(y, m, 1).getTime();
            var recs = this.records.filter(function(r) { var t = new Date(r.date).getTime(); return t >= ms && t < me; });
            incomeData.push(Math.round(recs.filter(function(r) { return r.type === 'income'; }).reduce(function(s, r) { return s + r.amount; }, 0) * 100) / 100);
            expenseData.push(Math.round(recs.filter(function(r) { return r.type === 'expense'; }).reduce(function(s, r) { return s + Math.abs(r.amount); }, 0) * 100) / 100);
        }
        var ctx = document.getElementById('line-chart').getContext('2d');
        this.lineChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    { label: '收入', data: incomeData, borderColor: '#007AFF', backgroundColor: 'rgba(0,122,255,0.08)', fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#007AFF', borderWidth: 2 },
                    { label: '支出', data: expenseData, borderColor: '#FF9500', backgroundColor: 'rgba(255,149,0,0.08)', fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#FF9500', borderWidth: 2 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { family: '-apple-system', size: 12 }, color: '#86868B' } }, tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.dataset.label + ': ¥' + ctx.raw.toFixed(2); } } } },
                scales: { y: { beginAtZero: true, grid: { color: '#F2F2F7' }, ticks: { callback: function(v) { return '¥' + v; }, font: { size: 11 }, color: '#AEAEB2' } }, x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#AEAEB2' } } }
            }
        });
    }

    renderRanking() {
        var range = this.getChartTimeRange();
        var start = range.start, end = range.end;

        // 支出排行榜 Top 10
        var expenses = this.records.filter(function(r) { var t = new Date(r.date).getTime(); return t >= start && t < end && r.type === 'expense'; });
        var expContainer = document.getElementById('ranking-list-expense');
        if (expenses.length === 0) {
            expContainer.innerHTML = '<div class="empty-records">暂无支出数据</div>';
        } else {
            var expMap = {};
            expenses.forEach(function(r) { expMap[r.category] = (expMap[r.category] || 0) + Math.abs(r.amount); });
            var expTotal = expenses.reduce(function(s, r) { return s + Math.abs(r.amount); }, 0);
            var expEntries = Object.entries(expMap).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);
            var expMax = expEntries.length > 0 ? expEntries[0][1] : 1;
            var self = this;
            expContainer.innerHTML = expEntries.map(function(e, i) {
                var cat = e[0], amt = e[1];
                var pct = ((amt / expTotal) * 100).toFixed(1), barW = Math.round((amt / expMax) * 100);
                var cfg = self.categories[cat] || self.categories['其他'];
                var rc = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-default';
                return '<div class="ranking-item">' +
                    '<div class="ranking-rank ' + rc + '">' + (i < 3 ? i + 1 : '-') + '</div>' +
                    '<div class="ranking-info"><div class="ranking-category">' + cfg.icon + ' ' + cat + '</div><div class="ranking-bar-wrap"><div class="ranking-bar" style="width:' + barW + '%;background:' + (cfg.color || 'var(--accent)') + '"></div></div></div>' +
                    '<div class="ranking-amount">¥' + amt.toFixed(2) + '</div><div class="ranking-percent">' + pct + '%</div>' +
                '</div>';
            }).join('');
        }

        // 收入排行榜 Top 10
        var incomes = this.records.filter(function(r) { var t = new Date(r.date).getTime(); return t >= start && t < end && r.type === 'income'; });
        var incContainer = document.getElementById('ranking-list-income');
        if (incomes.length === 0) {
            incContainer.innerHTML = '<div class="empty-records">暂无收入数据</div>';
        } else {
            var incMap = {};
            incomes.forEach(function(r) { incMap[r.category] = (incMap[r.category] || 0) + r.amount; });
            var incTotal = incomes.reduce(function(s, r) { return s + r.amount; }, 0);
            var incEntries = Object.entries(incMap).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);
            var incMax = incEntries.length > 0 ? incEntries[0][1] : 1;
            var self2 = this;
            incContainer.innerHTML = incEntries.map(function(e, i) {
                var cat = e[0], amt = e[1];
                var pct = ((amt / incTotal) * 100).toFixed(1), barW = Math.round((amt / incMax) * 100);
                var cfg = self2.categories[cat] || self2.categories['其他'];
                var rc = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-default';
                return '<div class="ranking-item">' +
                    '<div class="ranking-rank ' + rc + '">' + (i < 3 ? i + 1 : '-') + '</div>' +
                    '<div class="ranking-info"><div class="ranking-category">' + cfg.icon + ' ' + cat + '</div><div class="ranking-bar-wrap"><div class="ranking-bar" style="width:' + barW + '%;background:' + (cfg.color || 'var(--accent)') + '"></div></div></div>' +
                    '<div class="ranking-amount" style="color:var(--income)">¥' + amt.toFixed(2) + '</div><div class="ranking-percent">' + pct + '%</div>' +
                '</div>';
            }).join('');
        }
    }

    // ========== 规划师 ==========
    setGoal() {
        var input = document.getElementById('goal-input').value.trim();
        if (!input) return;
        this.goal = { text: input, createdAt: Date.now() };
        this.saveGoal();
        document.getElementById('goal-input').value = '';
        this.renderGoalStatus();
        this.addPlannerMessage('user', input);
        this.generateAdvice(input);
    }

    renderGoalStatus() {
        var status = document.getElementById('goal-status');
        if (!this.goal) { status.innerHTML = '<span class="goal-empty-hint">设定一个财务目标开始规划</span>'; return; }
        var parsed = this.parseGoal(this.goal.text);
        var progress = parsed ? this.calcGoalProgress(parsed) : 0;
        status.innerHTML = '<div class="goal-active">' +
            '<div class="goal-text">' + this.goal.text + '</div>' +
            '<div class="goal-progress-bar"><div class="goal-progress-fill" style="width:' + Math.min(100, progress) + '%"></div></div>' +
            '<div class="goal-progress-text">已存：\u00A5' + (parsed ? parsed.currentSaving.toFixed(2) : '0') + ' / 目标：\u00A5' + (parsed ? parsed.target.toFixed(2) : '---') + '</div>' +
        '</div>';
    }

    parseGoal(text) {
        var monthMatch = text.match(/(\d+)\s*(个?\s*月)/);
        var amountMatch = text.match(/[存活攒]\s*(\d+\.?\d*)\s*(万|千|块|元|W|w|K|k)?/);
        if (!amountMatch) return null;
        var target = parseFloat(amountMatch[1]);
        var unit = amountMatch[2] || '';
        if (unit === '万' || unit === 'W' || unit === 'w') target *= 10000;
        else if (unit === '千' || unit === 'K' || unit === 'k') target *= 1000;
        var months = monthMatch ? parseInt(monthMatch[1]) : 3;
        var allIncome = this.records.filter(function(r) { return r.type === 'income'; }).reduce(function(s, r) { return s + r.amount; }, 0);
        var allExpense = this.records.filter(function(r) { return r.type === 'expense'; }).reduce(function(s, r) { return s + Math.abs(r.amount); }, 0);
        return { target: target, months: months, currentSaving: allIncome - allExpense };
    }

    calcGoalProgress(p) { return p.target <= 0 ? 0 : Math.round((p.currentSaving / p.target) * 100); }

    addPlannerMessage(role, text) {
        var container = document.getElementById('chat-messages');
        var div = document.createElement('div');
        div.className = 'chat-bubble ' + role;
        div.innerHTML = '<div class="chat-avatar">' + (role === 'system' ? 'AI' : '我') + '</div><div class="chat-text">' + text + '</div>';
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    generateAdvice(goalText) {
        var parsed = this.parseGoal(goalText);
        if (!parsed) {
            this.tryLLMAdvice(goalText);
            return;
        }
        var stats = this.getMonthStats();
        var income = stats.income, expense = stats.expense;
        var saving = income - expense;
        var monthlyTarget = parsed.target / parsed.months;
        var savingsRate = income > 0 ? (saving / income) : 0;
        var advice = '<h4>目标分析</h4><ul><li>目标：' + parsed.months + '个月内存到 ¥' + parsed.target.toFixed(0) + '</li><li>每月需存：¥' + monthlyTarget.toFixed(0) + '</li><li>当前已存：¥' + parsed.currentSaving.toFixed(2) + '</li></ul>';
        advice += '<h4>当前收支情况</h4><ul><li>本月收入：¥' + income.toFixed(2) + '</li><li>本月支出：¥' + expense.toFixed(2) + '</li><li>储蓄率：<span class="' + (savingsRate >= 0.2 ? 'highlight-good' : 'highlight-bad') + '">' + (savingsRate * 100).toFixed(1) + '%</span></li></ul>';
        advice += '<h4>专业建议</h4><ul>';
        var gap = monthlyTarget - saving;
        if (gap > 0) {
            advice += '<li><span class="highlight-warn">每月还差 ¥' + gap.toFixed(0) + '</span>，需要增加收入或减少支出。</li>';
            var recs = this.getMonthStats();
            var catMap = {};
            recs.records.filter(function(r) { return r.type === 'expense'; }).forEach(function(r) { catMap[r.category] = (catMap[r.category] || 0) + Math.abs(r.amount); });
            var top = Object.entries(catMap).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3);
            advice += '<li>前3大支出类别：';
            top.forEach(function(e) { advice += '<br>&nbsp;&nbsp;• ' + e[0] + '：¥' + e[1].toFixed(0) + '（占' + ((e[1]/expense)*100).toFixed(0) + '%）'; });
            advice += '</li>';
        } else { advice += '<li><span class="highlight-good">当前储蓄速度已达标</span>，按此节奏继续就可以。</li>'; }
        if (savingsRate < 0.2) advice += '<li>储蓄率偏低，推荐使用 <strong>50/30/20 法则</strong>：50%必需、30%想要、20%储蓄。</li>';
        advice += '<li>建议设立自动转账，发薪后立即转出储蓄额度，避免"剩下多少存多少"。</li></ul>';
        var dailySaving = monthlyTarget / 30;
        advice += '<p style="margin-top:12px;padding:12px 16px;background:var(--accent-light);border-radius:10px;font-size:14px;color:var(--accent);">要实现这个目标，每天需要存下 <strong>¥' + dailySaving.toFixed(0) + '</strong>。这意味着每天少买一杯奶茶，就迈出了第一步。</p>';

        var self = this;
        if (this.llmConfig && this.llmConfig.apiKey) {
            setTimeout(function() { self.addPlannerMessage('system', advice); }, 600);
            setTimeout(function() { self.tryLLMAdvice(goalText); }, 1000);
        } else {
            setTimeout(function() { self.addPlannerMessage('system', advice); }, 600);
        }
    }

    // ========== LLM 建议（规划师智能回复） ==========
    tryLLMAdvice(userText) {
        if (!this.llmConfig || !this.llmConfig.apiKey) {
            this.addPlannerMessage('system', '要处理复杂财务问题，请点击右上角齿轮图标设置 AI API Key。<br>推荐使用免费的 Google Gemini API：<a href="https://aistudio.google.com/apikey" target="_blank">获取 Key</a>');
            return;
        }
        var self = this;
        var loadingMsg = '<div class="llm-loading"><span class="llm-dot"></span><span class="llm-dot"></span><span class="llm-dot"></span> AI 正在分析你的财务数据...</div>';
        this.addPlannerMessage('system', loadingMsg);
        var loadingBubble = document.getElementById('chat-messages').lastElementChild;
        this.callLLM(userText, function(err, response) {
            if (loadingBubble) loadingBubble.remove();
            if (err) {
                self.addPlannerMessage('system', '抱歉，AI 服务暂时不可用：' + err + '<br>请检查 API Key 和网络连接。');
            } else {
                self.addPlannerMessage('system', response);
            }
        });
    }

    callLLM(userText, callback) {
        var provider = this.llmConfig.provider || 'gemini';
        var apiKey = this.llmConfig.apiKey;
        var model = this.llmConfig.model;

        var allIncome = this.records.filter(function(r) { return r.type === 'income'; });
        var allExpense = this.records.filter(function(r) { return r.type === 'expense'; });
        var totalIncome = allIncome.reduce(function(s, r) { return s + r.amount; }, 0);
        var totalExpense = allExpense.reduce(function(s, r) { return s + Math.abs(r.amount); }, 0);
        var savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100).toFixed(1) : '0';

        var recentMonths = [];
        var now = new Date();
        var self = this;
        for (var i = 0; i < 3; i++) {
            var y = now.getFullYear(), m = now.getMonth() - i;
            if (m < 0) { m += 12; y--; }
            var ms = self.getMonthStats(y, m + 1);
            recentMonths.push({ month: y + '/' + (m + 1), income: ms.income.toFixed(2), expense: ms.expense.toFixed(2) });
        }
        recentMonths.reverse();

        var catMap = {};
        allExpense.forEach(function(r) { catMap[r.category] = (catMap[r.category] || 0) + Math.abs(r.amount); });
        var topCats = Object.entries(catMap).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5)
            .map(function(e) { return e[0] + '：¥' + e[1].toFixed(0); }).join('，');

        var contextData = {
            总记录数: allIncome.length + allExpense.length,
            总收入: '¥' + totalIncome.toFixed(2),
            总支出: '¥' + totalExpense.toFixed(2),
            储蓄率: savingsRate + '%',
            最近三个月: recentMonths,
            支出Top5分类: topCats || '暂无',
            是否有目标: this.goal ? '是：' + this.goal.text : '否'
        };

        var contextStr = JSON.stringify(contextData, null, 2);

        var systemPrompt = '你是一个专业的个人财务规划师。你的任务是基于用户的记账数据，回答用户的财务问题，给出专业、具体、可操作的建议。回答要求：1）使用中文；2）简洁有条理，避免说教；3）基于数据给出量化分析；4）建议具体可执行。用户财务数据：\n' + contextStr;

        var url, body, headers;
        if (provider === 'openrouter') {
            url = 'https://openrouter.ai/api/v1/chat/completions';
            headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
            body = JSON.stringify({
                model: model || 'google/gemini-2.0-flash-001',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userText }
                ],
                max_tokens: 1024
            });
        } else {
            url = 'https://generativelanguage.googleapis.com/v1beta/models/' + (model || 'gemini-1.5-flash') + ':generateContent?key=' + apiKey;
            headers = { 'Content-Type': 'application/json' };
            body = JSON.stringify({
                contents: [
                    { role: 'user', parts: [{ text: systemPrompt + '\n\n用户问题：' + userText }] }
                ],
                generationConfig: { maxOutputTokens: 1024 }
            });
        }

        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        Object.keys(headers).forEach(function(k) { xhr.setRequestHeader(k, headers[k]); });
        xhr.timeout = 30000;
        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    var reply = '';
                    if (provider === 'openrouter') {
                        reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                    } else {
                        reply = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
                    }
                    if (reply) {
                        reply = reply.replace(/\n/g, '<br>');
                        callback(null, reply);
                    } else {
                        callback('API 返回异常：' + JSON.stringify(data.error || data).substring(0, 200), null);
                    }
                } catch(e) {
                    callback('解析响应失败：' + e.message, null);
                }
            } else {
                var errMsg = 'HTTP ' + xhr.status;
                try {
                    var errData = JSON.parse(xhr.responseText);
                    if (errData.error && errData.error.message) errMsg = errData.error.message;
                } catch(e) {}
                callback(errMsg, null);
            }
        };
        xhr.onerror = function() { callback('网络请求失败，请检查网络连接', null); };
        xhr.ontimeout = function() { callback('请求超时，请稍后重试', null); };
        xhr.send(body);
    }

    getMonthStats(year, month) {
        var y = year || new Date().getFullYear(), m = month || new Date().getMonth() + 1;
        var ms = new Date(y, m - 1, 1).getTime(), me = new Date(y, m, 1).getTime();
        var monthRecords = this.records.filter(function(r) { var t = new Date(r.date).getTime(); return t >= ms && t < me; });
        return {
            income: monthRecords.filter(function(r) { return r.type === 'income'; }).reduce(function(s, r) { return s + r.amount; }, 0),
            expense: monthRecords.filter(function(r) { return r.type === 'expense'; }).reduce(function(s, r) { return s + Math.abs(r.amount); }, 0),
            records: monthRecords
        };
    }

    // ========== 语音输入 ==========
    checkVoiceSupport() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            document.getElementById('voice-btn').style.display = 'none';
        }
    }

    startVoiceInput() {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { alert('请使用 Chrome 浏览器'); return; }
        var rec = new SR();
        rec.lang = 'zh-CN'; rec.continuous = false; rec.interimResults = false;
        var btn = document.getElementById('voice-btn'); btn.classList.add('recording');
        var self = this;
        rec.onresult = function(e) {
            var t = e.results[0][0].transcript;
            document.getElementById('input-field').value = t;
            self.previewInput(t);
        };
        rec.onerror = function(e) { if (e.error === 'not-allowed') alert('请允许麦克风权限'); };
        rec.onend = function() { btn.classList.remove('recording'); };
        rec.start();
    }

    // 图标选择器数据源（20+ 常用分类图标）
    iconList = ['🍲','🚗','🛍','🎮','🏠','💊','📚','📦','💰','💵','💳','☕','🍔','🍜','🎬','✈','🏨','👕','💇','🎵','⚽','📱','💻','🎁','🐶','🌸','📊','🎯','💡','🔧','📦','🎓'];

    // 渲染图标选择器
    renderIconPicker(selectedIcon) {
        var picker = document.getElementById('icon-picker');
        if (!picker) return;
        var self = this;
        picker.innerHTML = this.iconList.map(function(icon) {
            var active = icon === selectedIcon ? ' active' : '';
            return '<span class="icon-picker-item' + active + '" data-icon="' + icon + '">' + icon + '</span>';
        }).join('');
        picker.querySelectorAll('.icon-picker-item').forEach(function(item) {
            item.addEventListener('click', function() {
                picker.querySelectorAll('.icon-picker-item').forEach(function(el) { el.classList.remove('active'); });
                item.classList.add('active');
                document.getElementById('cat-icon-input').value = item.dataset.icon;
            });
        });
        // 如果没有选中的，默认选中第一个
        if (!picker.querySelector('.icon-picker-item.active') && this.iconList.length > 0) {
            var first = picker.querySelector('.icon-picker-item');
            if (first) {
                first.classList.add('active');
                document.getElementById('cat-icon-input').value = first.dataset.icon;
            }
        }
    }
    openCategoryManager() {
        this.catManagerTab = 'expense';
        this.editingCatIndex = -1;
        document.getElementById('cat-modal-overlay').classList.add('active');
        document.querySelectorAll('.cat-tab-btn').forEach(function(b) { b.classList.remove('active'); });
        document.querySelector('[data-cat-tab="expense"]').classList.add('active');
        this.hideCatEditForm();
        this.renderCatList();
    }

    closeCategoryManager() {
        document.getElementById('cat-modal-overlay').classList.remove('active');
        this.buildCategories();
        this.renderAll();
    }

    switchCatTab(tab) {
        this.catManagerTab = tab;
        document.querySelectorAll('.cat-tab-btn').forEach(function(b) { b.classList.remove('active'); });
        document.querySelector('[data-cat-tab="' + tab + '"]').classList.add('active');
        this.hideCatEditForm();
        this.renderCatList();
    }

    renderCatList() {
        var list = document.getElementById('cat-list');
        var cats = this.catManagerTab === 'expense' ? this.getExpenseCategories() : this.getIncomeCategories();
        if (cats.length === 0) {
            list.innerHTML = '<div class="empty-records" style="padding:24px">暂无分类</div>';
            return;
        }
        var self = this;
        var sorted = cats.map(function(cat, i) {
            var customIdx = self.customCategories.findIndex(function(c) { return c.name === cat.name && c.type === cat.type; });
            return { name: cat.name, icon: cat.icon, color: cat.color, type: cat.type, keywords: cat.keywords, isDefault: cat.isDefault !== false && customIdx < 0, _customIdx: customIdx, _order: customIdx >= 0 ? (self.customCategories[customIdx].order || customIdx) : 9999 + i };
        }).sort(function(a, b) { return a._order - b._order; });

        list.innerHTML = sorted.map(function(cat) {
            var isDefault = cat.isDefault;
            return '<div class="cat-list-item" draggable="true" data-name="' + cat.name + '" data-type="' + cat.type + '" data-custom-idx="' + cat._customIdx + '">' +
                '<span class="cat-drag-handle">\u2630</span>' +
                '<span class="cat-item-icon" style="background:' + cat.color + '20;color:' + cat.color + '">' + cat.icon + '</span>' +
                '<span class="cat-item-name">' + cat.name + '</span>' +
                (isDefault ? '<span class="cat-item-badge">默认</span>' : '') +
                (!isDefault ? '<button class="cat-item-edit" data-idx="' + cat._customIdx + '">\u270E</button><button class="cat-item-del" data-idx="' + cat._customIdx + '">\u00D7</button>' : '') +
            '</div>';
        }).join('');

        list.querySelectorAll('.cat-list-item').forEach(function(item) {
            item.addEventListener('dragstart', function(e) { self.onDragStart(e); });
            item.addEventListener('dragover', function(e) { e.preventDefault(); item.classList.add('drag-over'); });
            item.addEventListener('dragleave', function() { item.classList.remove('drag-over'); });
            item.addEventListener('drop', function(e) { self.onDrop(e, item); });
            item.addEventListener('dragend', function() { list.querySelectorAll('.cat-list-item').forEach(function(el) { el.classList.remove('drag-over'); }); });
        });

        list.querySelectorAll('.cat-item-edit').forEach(function(btn) {
            btn.addEventListener('click', function(e) { e.stopPropagation(); self.showCatEditForm(parseInt(btn.dataset.idx)); });
        });
        list.querySelectorAll('.cat-item-del').forEach(function(btn) {
            btn.addEventListener('click', function(e) { e.stopPropagation(); self.deleteCategory(parseInt(btn.dataset.idx)); });
        });
    }

    onDragStart(e) {
        this.dragSrc = { name: e.target.dataset.name, type: e.target.dataset.type };
        e.dataTransfer.effectAllowed = 'move';
        e.target.style.opacity = '0.5';
    }

    onDrop(e, target) {
        e.preventDefault();
        if (!this.dragSrc) return;
        var dstName = target.dataset.name, dstType = target.dataset.type;
        if (this.dragSrc.type !== dstType) return;
        if (this.dragSrc.name === dstName) return;

        var srcIdx = this.customCategories.findIndex(function(c) { return c.name === this.dragSrc.name && c.type === this.dragSrc.type; }.bind(this));
        var dstIdx = this.customCategories.findIndex(function(c) { return c.name === dstName && c.type === dstType; });

        var srcCat;
        if (srcIdx < 0) {
            var def = this.defaultCategories[this.dragSrc.name];
            if (!def) return;
            srcCat = { name: this.dragSrc.name, icon: def.icon, color: def.color, type: this.dragSrc.type, keywords: (def.keywords || []).slice(), order: 0 };
        } else {
            srcCat = this.customCategories.splice(srcIdx, 1)[0];
        }

        var insertIdx;
        if (dstIdx < 0) {
            insertIdx = this.customCategories.length;
        } else {
            insertIdx = dstIdx;
        }
        this.customCategories.splice(insertIdx, 0, srcCat);
        this.reindexOrders();
        this.saveCustomCategories();
        this.renderCatList();
        this.dragSrc = null;
    }

    reindexOrders() {
        for (var i = 0; i < this.customCategories.length; i++) {
            this.customCategories[i].order = i;
        }
    }

    showCatEditForm(idx) {
        this.editingCatIndex = typeof idx === 'number' ? idx : -1;
        var form = document.getElementById('cat-edit-form');
        form.classList.add('active');
        document.getElementById('add-cat-btn').style.display = 'none';

        var selectedIcon = '📦';
        if (this.editingCatIndex >= 0) {
            var cat = this.customCategories[this.editingCatIndex];
            document.getElementById('cat-form-title').textContent = '编辑分类';
            document.getElementById('cat-name-input').value = cat.name;
            document.getElementById('cat-keywords-input').value = (cat.keywords || []).join(',');
            document.getElementById('cat-color-input').value = cat.color;
            document.getElementById('cat-type-select').value = cat.type;
            selectedIcon = cat.icon;
        } else {
            document.getElementById('cat-form-title').textContent = '添加分类';
            document.getElementById('cat-name-input').value = '';
            document.getElementById('cat-keywords-input').value = '';
            document.getElementById('cat-color-input').value = '#007AFF';
            document.getElementById('cat-type-select').value = this.catManagerTab;
        }
        this.renderIconPicker(selectedIcon);
    }

    hideCatEditForm() {
        document.getElementById('cat-edit-form').classList.remove('active');
        document.getElementById('add-cat-btn').style.display = '';
        this.editingCatIndex = -1;
    }

    saveCatForm() {
        var name = document.getElementById('cat-name-input').value.trim();
        var icon = document.getElementById('cat-icon-input').value.trim();
        var keywordsStr = document.getElementById('cat-keywords-input').value.trim();
        var color = document.getElementById('cat-color-input').value;
        var type = document.getElementById('cat-type-select').value;

        if (!name) { alert('请输入分类名称'); return; }
        if (!icon) { alert('请输入分类图标（如 🍔）'); return; }

        var keywords = keywordsStr ? keywordsStr.split(/[,，\s]+/).filter(Boolean) : [];

        if (this.editingCatIndex >= 0) {
            this.customCategories[this.editingCatIndex] = { name: name, icon: icon, color: color, type: type, keywords: keywords, order: this.editingCatIndex };
        } else {
            if (this.customCategories.some(function(c) { return c.name === name && c.type === type; })) { alert('该分类已存在'); return; }
            if (this.defaultCategories[name] && this.defaultCategories[name].type === type) { alert('与默认分类重名，请换一个名字'); return; }
            this.customCategories.push({ name: name, icon: icon, color: color, type: type, keywords: keywords, order: this.customCategories.length });
        }

        this.saveCustomCategories();
        this.buildCategories();
        this.hideCatEditForm();
        this.renderCatList();
    }

    deleteCategory(idx) {
        if (idx < 0 || idx >= this.customCategories.length) return;
        var cat = this.customCategories[idx];
        if (!confirm('确定删除分类"' + cat.name + '"？')) return;
        this.customCategories.splice(idx, 1);
        this.reindexOrders();
        this.saveCustomCategories();
        this.buildCategories();
        this.renderCatList();
    }

    // ========== 数据持久化 ==========
    loadRecords() {
        try { var d = localStorage.getItem('ma_records_v2'); return d ? JSON.parse(d) : []; } catch(e) { return []; }
    }
    saveRecords() { localStorage.setItem('ma_records_v2', JSON.stringify(this.records)); }

    loadGoal() {
        try { var d = localStorage.getItem('ma_goal_v2'); return d ? JSON.parse(d) : null; } catch(e) { return null; }
    }
    saveGoal() { this.goal ? localStorage.setItem('ma_goal_v2', JSON.stringify(this.goal)) : localStorage.removeItem('ma_goal_v2'); }

    loadCustomCategories() {
        try {
            var d = localStorage.getItem('ma_custom_cats');
            var arr = d ? JSON.parse(d) : [];
            return Array.isArray(arr) ? arr : [];
        } catch(e) { return []; }
    }
    saveCustomCategories() { localStorage.setItem('ma_custom_cats', JSON.stringify(this.customCategories)); }

    // ========== LLM 配置持久化 ==========
    loadLLMConfig() {
        try {
            var d = localStorage.getItem('ma_llm_config');
            return d ? JSON.parse(d) : null;
        } catch(e) { return null; }
    }
    saveLLMConfig() {
        var provider = document.getElementById('llm-provider-select').value;
        var apiKey = document.getElementById('llm-api-key-input').value.trim();
        var model = document.getElementById('llm-model-input').value.trim();
        if (!apiKey) { this.showSettingsStatus('请输入 API Key', 'error'); return; }
        this.llmConfig = { provider: provider, apiKey: apiKey, model: model || null };
        localStorage.setItem('ma_llm_config', JSON.stringify(this.llmConfig));
        this.showSettingsStatus('保存成功！', 'success');
        setTimeout(function() { app.closeSettings(); }, 800);
    }
    onLLMProviderChange(provider) {
        var hint = document.getElementById('llm-model-hint');
        if (provider === 'gemini') {
            hint.textContent = 'Gemini 默认：gemini-1.5-flash';
            document.getElementById('llm-model-input').placeholder = 'gemini-1.5-flash';
        } else {
            hint.textContent = 'OpenRouter 默认：google/gemini-2.0-flash-001';
            document.getElementById('llm-model-input').placeholder = 'google/gemini-2.0-flash-001';
        }
    }
    showSettingsStatus(msg, type) {
        var el = document.getElementById('settings-status');
        el.textContent = msg;
        el.className = 'settings-status ' + type;
        el.style.display = '';
        if (type) {
            setTimeout(function() { el.className = 'settings-status'; }, 3000);
        }
    }
    testLLMConnection() {
        var provider = document.getElementById('llm-provider-select').value;
        var apiKey = document.getElementById('llm-api-key-input').value.trim();
        if (!apiKey) { this.showSettingsStatus('请先输入 API Key', 'error'); return; }
        this.showSettingsStatus('正在测试连接...', '');
        var self = this;
        var testConfig = { provider: provider, apiKey: apiKey, model: document.getElementById('llm-model-input').value.trim() || null };
        var origConfig = this.llmConfig;
        this.llmConfig = testConfig;
        this.callLLM('你好，请回复"连接成功"', function(err, resp) {
            self.llmConfig = origConfig;
            if (err) {
                self.showSettingsStatus('连接失败：' + err.substring(0, 100), 'error');
            } else {
                self.showSettingsStatus('连接成功！', 'success');
            }
        });
    }

    // ========== 设置面板 ==========
    openSettings() {
        var overlay = document.getElementById('settings-overlay');
        overlay.classList.add('active');
        // 填充当前配置
        if (this.llmConfig) {
            document.getElementById('llm-provider-select').value = this.llmConfig.provider || 'gemini';
            document.getElementById('llm-api-key-input').value = this.llmConfig.apiKey || '';
            document.getElementById('llm-model-input').value = this.llmConfig.model || '';
            this.onLLMProviderChange(this.llmConfig.provider || 'gemini');
        }
    }
    closeSettings() {
        document.getElementById('settings-overlay').classList.remove('active');
    }

    // ========== 财务健康评估 ==========
    renderHealthCard() {
        var result = this.computeHealthScore();
        var score = result.score;
        var grade = result.grade;
        var gradeText = result.gradeText;
        var gradeDesc = result.gradeDesc;
        var dims = result.dimensions;

        // 更新分数圆环
        var fg = document.getElementById('score-fg');
        var circumference = 2 * Math.PI * 34; // r=34
        var offset = circumference - (score / 100) * circumference;
        fg.style.strokeDasharray = circumference;
        fg.style.strokeDashoffset = offset;
        fg.style.stroke = result.color;

        document.getElementById('score-number').textContent = score;
        document.getElementById('health-grade').textContent = gradeText;
        document.getElementById('health-grade-desc').textContent = gradeDesc;
        document.getElementById('health-grade').style.color = result.color;

        // 更新维度详情
        var icons = { savings: '💰', balance: '⚖️', structure: '📊', reserve: '🛡️' };
        var colors = { low: 'var(--expense)', mid: '#FFCC00', high: '#34C759' };
        var html = dims.map(function(d) {
            var barClass = d.score >= 70 ? 'high' : d.score >= 40 ? 'mid' : 'low';
            return '<div class="health-dim-item">' +
                '<div class="health-dim-icon" style="background:' + d.color + '20;color:' + d.color + '">' + icons[d.key] + '</div>' +
                '<div class="health-dim-info">' +
                    '<div class="health-dim-name">' + d.name + '</div>' +
                    '<div class="health-dim-bar-wrap"><div class="health-dim-bar ' + barClass + '" style="width:' + d.score + '%"></div></div>' +
                    '<div class="health-dim-advice">' + d.advice + '</div>' +
                '</div>' +
                '<div class="health-dim-score" style="color:' + d.color + '">' + d.score + '</div>' +
            '</div>';
        }).join('');
        document.getElementById('health-dimensions').innerHTML = html;
    }

    computeHealthScore() {
        var now = new Date();
        var thisYear = now.getFullYear(), thisMonth = now.getMonth() + 1;
        var lastYear = thisMonth === 1 ? thisYear - 1 : thisYear;
        var lastMonth = thisMonth === 1 ? 12 : thisMonth - 1;

        // 近3个月数据
        var months = [];
        for (var i = 0; i < 3; i++) {
            var y = thisYear, m = thisMonth - i;
            while (m < 1) { m += 12; y--; }
            months.push(this.getMonthStats(y, m));
        }

        var totalIncome = 0, totalExpense = 0;
        months.forEach(function(s) { totalIncome += s.income; totalExpense += s.expense; });
        var avgMonthlyIncome = months.length > 0 ? totalIncome / months.length : 0;
        var avgMonthlyExpense = months.length > 0 ? totalExpense / months.length : 0;
        var avgSavingsRate = avgMonthlyIncome > 0 ? ((avgMonthlyIncome - avgMonthlyExpense) / avgMonthlyIncome * 100) : 0;

        // 维度1：储蓄率（0-100）
        var savingsScore = Math.max(0, Math.min(100, avgSavingsRate + 20));
        var savingsAdvice = '';
        if (avgSavingsRate >= 20) savingsAdvice = '储蓄率健康，继续保持';
        else if (avgSavingsRate >= 10) savingsAdvice = '储蓄率偏低，建议提升至20%';
        else if (avgSavingsRate > 0) savingsAdvice = '储蓄率过低，需控制支出';
        else savingsAdvice = '收支失衡，需立即调整';

        // 维度2：收支平衡（0-100）
        var balanceScore = 0;
        if (avgMonthlyIncome > 0) {
            if (avgMonthlyExpense <= avgMonthlyIncome) balanceScore = 80 + Math.min(20, (1 - avgMonthlyExpense/avgMonthlyIncome) * 20);
            else balanceScore = Math.max(0, 80 - (avgMonthlyExpense - avgMonthlyIncome) / avgMonthlyIncome * 80);
        }
        var balanceAdvice = avgMonthlyExpense <= avgMonthlyIncome ? '收支平衡良好' : '支出超过收入，需调整';

        // 维度3：消费结构（0-100）
        var catMap = {};
        months.forEach(function(s) {
            s.records.filter(function(r) { return r.type === 'expense'; }).forEach(function(r) { catMap[r.category] = (catMap[r.category] || 0) + Math.abs(r.amount); });
        });
        var topCatPct = 0;
        var entries = Object.entries(catMap).sort(function(a, b) { return b[1] - a[1]; });
        if (entries.length > 0 && totalExpense > 0) topCatPct = entries[0][1] / totalExpense * 100;
        var structureScore = Math.max(0, 100 - topCatPct * 0.5);
        var structureAdvice = topCatPct > 50 ? '消费过度集中，注意分散风险' : '消费结构较均衡';

        // 维度4：应急储备（0-100）
        var reserveScore = 0;
        if (avgMonthlyExpense > 0 && this.records.filter(function(r) { return r.type === 'income'; }).length > 0) {
            // 用当前余额估算应急月数
            var balance = this.records.filter(function(r) { return r.type === 'income'; }).reduce(function(s, r) { return s + r.amount; }, 0)
                        - this.records.filter(function(r) { return r.type === 'expense'; }).reduce(function(s, r) { return s + Math.abs(r.amount); }, 0);
            var reserveMonths = balance / avgMonthlyExpense;
            reserveScore = Math.min(100, reserveMonths / 6 * 100);
        }
        var reserveAdvice = reserveScore >= 50 ? '应急储备充足' : '建议储备3-6个月支出作为应急金';

        var dims = [
            { key: 'savings', name: '储蓄率', score: Math.round(savingsScore), advice: savingsAdvice, color: savingsScore >= 70 ? '#34C759' : savingsScore >= 40 ? '#FFCC00' : 'var(--expense)' },
            { key: 'balance', name: '收支平衡', score: Math.round(balanceScore), advice: balanceAdvice, color: balanceScore >= 70 ? '#34C759' : balanceScore >= 40 ? '#FFCC00' : 'var(--expense)' },
            { key: 'structure', name: '消费结构', score: Math.round(structureScore), advice: structureAdvice, color: structureScore >= 70 ? '#34C759' : structureScore >= 40 ? '#FFCC00' : 'var(--expense)' },
            { key: 'reserve', name: '应急储备', score: Math.round(reserveScore), advice: reserveAdvice, color: reserveScore >= 50 ? '#34C759' : reserveScore >= 25 ? '#FFCC00' : 'var(--expense)' }
        ];

        var totalScore = Math.round(dims.reduce(function(s, d) { return s + d.score; }, 0) / 4);
        var grade, gradeText, gradeDesc, color;
        if (totalScore >= 80) { grade = 'excellent'; gradeText = '优秀'; gradeDesc = '财务状况非常健康'; color = '#34C759'; }
        else if (totalScore >= 60) { grade = 'good'; gradeText = '良好'; gradeDesc = '财务状况整体健康'; color = '#007AFF'; }
        else if (totalScore >= 40) { grade = 'fair'; gradeText = '一般'; gradeDesc = '有一些需要改善的地方'; color = '#FFCC00'; }
        else { grade = 'poor'; gradeText = '需改善'; gradeDesc = '建议尽快调整财务习惯'; color = 'var(--expense)'; }

        return { score: totalScore, grade: grade, gradeText: gradeText, gradeDesc: gradeDesc, color: color, dimensions: dims };
    }

    // ========== 数据管理 ==========
    exportData() {
        var data = {
            records: this.records,
            goal: this.goal,
            customCategories: this.customCategories,
            exportTime: new Date().toISOString()
        };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = '记账数据_' + new Date().toISOString().slice(0,10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        this.showSettingsStatus('导出成功', 'success');
    }
    importData() {
        var self = this;
        var input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = function(e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(ev) {
                try {
                    var data = JSON.parse(ev.target.result);
                    if (data.records) { self.records = data.records; self.saveRecords(); }
                    if (data.goal) { self.goal = data.goal; self.saveGoal(); }
                    if (data.customCategories) { self.customCategories = data.customCategories; self.saveCustomCategories(); }
                    self.buildCategories();
                    self.renderAll();
                    self.showSettingsStatus('导入成功！', 'success');
                } catch(err) {
                    self.showSettingsStatus('导入失败：文件格式错误', 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
    clearAllData() {
        if (!confirm('确定清除所有数据？此操作不可恢复！')) return;
        this.records = []; this.goal = null; this.customCategories = [];
        localStorage.removeItem('ma_records_v2');
        localStorage.removeItem('ma_goal_v2');
        localStorage.removeItem('ma_custom_cats');
        localStorage.removeItem('ma_llm_config');
        this.buildCategories();
        this.renderAll();
        this.showSettingsStatus('所有数据已清除', 'success');
    }
}

// ========== 启动 ==========
var app;
document.addEventListener('DOMContentLoaded', function() {
    app = new AccountingApp();
    window.app = app;
});
