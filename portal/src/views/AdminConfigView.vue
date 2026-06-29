<template>
  <div class="relative z-10 min-h-screen">
    <NavBar />

    <main class="max-w-[1000px] mx-auto px-6 py-10 pt-[132px]">
      <!-- Admin Nav -->
      <div class="flex items-center gap-4 mb-6">
        <button
          @click="$router.push('/admin')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin' ? 'bg-text text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          审核管理
        </button>
        <button
          @click="$router.push('/admin/skills')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/skills' ? 'bg-text text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          技能管理
        </button>
        <button
          @click="$router.push('/admin/users')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/users' ? 'bg-text text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          用户管理
        </button>
        <button
          @click="$router.push('/admin/config')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/config' ? 'bg-text text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          系统配置
        </button>
        <button
          @click="$router.push('/admin/oauth')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/oauth' ? 'bg-text text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          第三方登录
        </button>
      </div>

      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text">系统配置</h1>
          <p class="text-text-secondary text-sm mt-1">
            配置文件存储方式和云存储参数
          </p>
        </div>
        <button
          @click="logout"
          class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all"
        >
          退出登录
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-20 text-text-secondary">
        加载中...
      </div>

      <!-- Config Form -->
      <div v-else class="space-y-6">

        <!-- Tab 切换 -->
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-1.5 inline-flex gap-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
            :class="activeTab === tab.id
              ? 'bg-text text-white'
              : 'text-text-secondary hover:text-text hover:bg-surface-secondary'"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- ===== Tab: 存储(已隐藏,与 1Panel 对接后存储走 Skills Hub,本地/COS 配置不再需要,代码保留) ===== -->
        <div v-show="false">

        <!-- Current Status -->
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                   :class="activeStorageType === 'cos' ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500'">
                {{ activeStorageType === 'cos' ? '☁️' : '💾' }}
              </div>
              <div>
                <div class="text-sm text-text-secondary">当前存储模式</div>
                <div class="text-lg font-semibold text-text">
                  {{ activeStorageType === 'cos' ? '腾讯云 COS' : '本地磁盘' }}
                </div>
              </div>
              <span class="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600">
                运行中
              </span>
            </div>
            <div v-if="activeStorageType === 'local' && cosConfigured" class="text-right">
              <!-- COS 切换按钮已隐藏,保留本地存储 -->
            </div>
            <div v-else-if="activeStorageType === 'cos'" class="text-right">
              <button
                @click="confirmSwitch('local')"
                :disabled="switching"
                class="px-5 py-2.5 border border-[rgba(0,0,0,0.06)] text-sm font-medium rounded-lg hover:bg-surface-secondary transition-all disabled:opacity-50"
              >
                {{ switching ? '切换中...' : '切换到本地' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Local Config -->
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-text">本地磁盘</h2>
            <span v-if="activeStorageType === 'local'" class="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600">
              当前使用
            </span>
          </div>
          <div>
            <label class="block text-sm font-medium text-text mb-1">存储目录</label>
            <input
              v-model="form.localPath"
              type="text"
              class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text font-mono text-sm"
              placeholder="/data/uploads/skills"
            />
            <p class="text-xs text-text-secondary mt-1">Skill 包文件存储的本地目录，留空使用默认路径</p>
          </div>
          <button
            @click="saveLocalPath"
            :disabled="savingLocal"
            class="mt-4 px-4 py-2 text-sm font-medium bg-text text-white rounded-lg hover:bg-text/90 transition-all disabled:opacity-50"
          >
            {{ savingLocal ? '保存中...' : '保存路径' }}
          </button>
          <span v-if="localSaveMsg" class="ml-3 text-sm" :class="localSaveOk ? 'text-green-600' : 'text-red-500'">
            {{ localSaveMsg }}
          </span>
        </div>

        <!-- COS Config (已隐藏,代码保留) -->
        <div v-if="false" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-text">腾讯云 COS</h2>
            <span v-if="activeStorageType === 'cos'" class="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600">
              当前使用
            </span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-text mb-1">Secret ID</label>
              <input
                v-model="form.cosSecretId"
                type="text"
                class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text"
                placeholder="AKIDxxxxxxxx"
              />
              <p class="text-xs text-text-secondary mt-1">在「访问管理 → API密钥管理」中获取</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-text mb-1">Secret Key</label>
              <div class="relative">
                <input
                  v-model="form.cosSecretKey"
                  :type="showKey ? 'text' : 'password'"
                  class="w-full px-3 py-2 pr-10 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text"
                  placeholder="xxxxxxxxxx"
                />
                <button
                  @click="showKey = !showKey"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text"
                >
                  {{ showKey ? '🙈' : '👁️' }}
                </button>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-text mb-1">Bucket 名称</label>
              <input
                v-model="form.cosBucket"
                type="text"
                class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text"
                placeholder="my-bucket-1250000000"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-text mb-1">Region</label>
              <select
                v-model="form.cosRegion"
                class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text"
              >
                <option value="ap-guangzhou">华南-广州 (ap-guangzhou)</option>
                <option value="ap-beijing">华北-北京 (ap-beijing)</option>
                <option value="ap-shanghai">华东-上海 (ap-shanghai)</option>
                <option value="ap-chengdu">西南-成都 (ap-chengdu)</option>
                <option value="ap-hongkong">港澳台-中国香港 (ap-hongkong)</option>
                <option value="ap-singapore">亚太-新加坡 (ap-singapore)</option>
              </select>
            </div>
          </div>
          <div class="flex items-center gap-3 mt-4">
            <button
              @click="testCOS"
              :disabled="testing"
              class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all disabled:opacity-50"
            >
              {{ testing ? '测试中...' : '🔗 测试连接' }}
            </button>
            <span v-if="testResult" class="text-sm" :class="testSuccess ? 'text-green-600' : 'text-red-500'">
              {{ testResult }}
            </span>
          </div>
          <button
            @click="saveCOSConfig"
            :disabled="savingCOS"
            class="mt-4 px-4 py-2 text-sm font-medium bg-text text-white rounded-lg hover:bg-text/90 transition-all disabled:opacity-50"
          >
            {{ savingCOS ? '保存中...' : '保存 COS 配置' }}
          </button>
          <span v-if="cosSaveMsg" class="ml-3 text-sm" :class="cosSaveOk ? 'text-green-600' : 'text-red-500'">
            {{ cosSaveMsg }}
          </span>
        </div>

        </div><!-- /Tab: 存储 -->

        <!-- ===== Tab: 1Panel 网关 ===== -->
        <div v-show="activeTab === 'panel'" class="space-y-6">

        <!-- 1Panel 网关配置 -->
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-lg font-semibold text-text">1Panel 网关</h2>
              <p class="text-xs text-text-secondary mt-1">配置 1Panel 企业版地址,用于聚合模型与技能列表</p>
            </div>
            <span v-if="panelForm.apiKeyConfigured" class="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600">
              已配置
            </span>
            <span v-else class="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-600">
              未配置
            </span>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <label class="block text-sm font-medium text-text mb-1">网关地址 (Base URL)</label>
              <input
                v-model="panelForm.baseUrl"
                type="text"
                class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text font-mono text-sm"
                placeholder="http://192.168.1.100:33846"
              />
              <p class="text-xs text-text-secondary mt-1">1Panel 服务地址,需包含协议和端口</p>
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-medium text-text mb-1">API Key</label>
              <div class="relative">
                <input
                  v-model="panelForm.apiKey"
                  :type="showPanelKey ? 'text' : 'password'"
                  class="w-full px-3 py-2 pr-10 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text font-mono text-sm"
                  :placeholder="panelForm.apiKeyConfigured ? '已配置,如需修改请输入新值' : '在 1Panel 设置 → API 接口中创建'"
                />
                <button
                  @click="showPanelKey = !showPanelKey"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text"
                >
                  {{ showPanelKey ? '🙈' : '👁️' }}
                </button>
              </div>
              <p class="text-xs text-text-secondary mt-1">留空保留原值;填新值则覆盖</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-text mb-1">请求超时 (ms)</label>
              <input
                v-model.number="panelForm.timeout"
                type="number"
                min="1000"
                step="1000"
                class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-text mb-1">同步间隔 (分钟)</label>
              <input
                v-model.number="panelForm.syncIntervalMinutes"
                type="number"
                min="1"
                step="1"
                class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text"
              />
              <p class="text-xs text-text-secondary mt-1">最小 1 分钟,推荐 10 分钟</p>
            </div>
          </div>

          <!-- 同步开关 -->
          <div class="mt-4 flex items-center justify-between p-3 bg-surface-secondary rounded-lg">
            <div>
              <div class="text-sm font-medium text-text">启用定时同步</div>
              <div class="text-xs text-text-secondary mt-0.5">关闭后,模型和技能列表将不再自动从 1Panel 拉取</div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="panelForm.syncEnabled" type="checkbox" class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5"></div>
            </label>
          </div>

          <!-- 用户提交同步上传开关 -->
          <div class="mt-3 flex items-center justify-between p-3 bg-surface-secondary rounded-lg">
            <div>
              <div class="text-sm font-medium text-text">用户提交技能时同步上传到 1Panel</div>
              <div class="text-xs text-text-secondary mt-0.5">开启后,普通用户上传技能包会先写入 1Panel Skills Hub;失败则本次提交失败,不进入本地审核</div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="panelForm.skillUploadEnabled" type="checkbox" class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5"></div>
            </label>
          </div>

          <!-- 允许用户提交技能 -->
          <div class="mt-3 flex items-center justify-between p-3 bg-surface-secondary rounded-lg">
            <div>
              <div class="text-sm font-medium text-text">允许用户提交技能</div>
              <div class="text-xs text-text-secondary mt-0.5">关闭后,普通用户在「我的技能」页面看不到「提交技能」入口;提交接口也会被后端拒绝</div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="panelForm.skillSubmitEnabled" type="checkbox" class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5"></div>
            </label>
          </div>

          <!-- 1Panel 用户角色 -->
          <div class="flex items-center justify-between py-5 border-b border-[rgba(0,0,0,0.06)] last:border-b-0">
            <div class="min-w-0 flex-1 pr-4">
              <div class="text-sm font-medium text-text">1Panel 新建用户角色</div>
              <div class="text-xs text-text-secondary mt-0.5">选择通过本平台创建 1Panel 用户时使用的角色。角色列表来自 1Panel</div>
            </div>
            <div class="shrink-0 flex items-center gap-2">
              <select v-model.number="panelForm.userRoleId"
                class="px-3 py-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm focus:outline-none focus:border-text bg-white min-w-[140px]">
                <option v-for="r in panelRoles" :key="r.id" :value="r.id">{{ r.name }}</option>
              </select>
              <span class="text-xs text-text-tertiary whitespace-nowrap">保存后新建用户生效</span>
            </div>
          </div>

          <!-- 最近同步状态 -->
          <div v-if="panelForm.lastSync && (panelForm.lastSync.models || panelForm.lastSync.skills)" class="mt-4 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
            <div class="text-xs font-semibold text-text-secondary mb-2">最近同步</div>
            <div v-if="panelForm.lastSync.models" class="text-xs flex items-center gap-2 mb-1">
              <span class="font-medium">模型:</span>
              <span class="text-text-secondary">{{ formatDate(panelForm.lastSync.models.created_at) }}</span>
              <span class="text-emerald-600">✓ {{ panelForm.lastSync.models.message }}</span>
            </div>
            <div v-if="panelForm.lastSync.skills" class="text-xs flex items-center gap-2">
              <span class="font-medium">技能:</span>
              <span class="text-text-secondary">{{ formatDate(panelForm.lastSync.skills.created_at) }}</span>
              <span class="text-emerald-600">✓ {{ panelForm.lastSync.skills.message }}</span>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex items-center gap-3 mt-4 flex-wrap">
            <button
              @click="testPanel"
              :disabled="panelTesting"
              class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all disabled:opacity-50"
            >
              {{ panelTesting ? '测试中...' : '🔗 测试连接' }}
            </button>
            <button
              @click="syncNow"
              :disabled="panelSyncing"
              class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all disabled:opacity-50"
            >
              {{ panelSyncing ? '同步中...' : '⚡ 立即同步' }}
            </button>
            <button
              @click="savePanelConfig"
              :disabled="panelSaving"
              class="px-4 py-2 text-sm font-medium bg-text text-white rounded-lg hover:bg-text/90 transition-all disabled:opacity-50"
            >
              {{ panelSaving ? '保存中...' : '保存配置' }}
            </button>
            <span v-if="panelMsg" class="text-sm" :class="panelMsgOk ? 'text-green-600' : 'text-red-500'">
              {{ panelMsg }}
            </span>
          </div>
        </div>

        </div><!-- /Tab: 1Panel 网关 -->

        <!-- ===== Tab: 站点设置 (合并: 站点品牌 + 调用示例 + 公告横幅) ===== -->
        <div v-show="activeTab === 'site'" class="space-y-6">

        <!-- ----- 调用示例 ----- -->

        <!-- 调用示例配置 -->
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-lg font-semibold text-text">调用示例</h2>
              <p class="text-xs text-text-secondary mt-1">前台模型页展示给用户的 Base URL 和 curl 示例,支持占位符 <code class="font-mono">{{ ph.baseUrl }}</code> / <code class="font-mono">{{ ph.modelName }}</code> / <code class="font-mono">{{ ph.apiKey }}</code></p>
            </div>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-text mb-1">调用地址 (Base URL)</label>
              <input
                v-model="modelExampleForm.endpoint"
                type="text"
                class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text font-mono text-sm"
                placeholder="https://your-gateway:port/v1"
              />
              <p class="text-xs text-text-secondary mt-1">用户复制 Base URL 时的内容,会替换模板里的 <code class="font-mono">{{ ph.baseUrl }}</code></p>
            </div>
            <div>
              <label class="block text-sm font-medium text-text mb-1">示例模板 (curl)</label>
              <textarea
                v-model="modelExampleForm.template"
                rows="6"
                class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text font-mono text-xs leading-[1.7]"
                placeholder='curl -X POST {{base_url}}/chat/completions ...'
              ></textarea>
              <p class="text-xs text-text-secondary mt-1">支持 <code class="font-mono">{{ ph.baseUrl }}</code> / <code class="font-mono">{{ ph.modelName }}</code> / <code class="font-mono">{{ ph.apiKey }}</code> 三个占位符</p>
            </div>
          </div>
          <div class="mt-4 flex items-center gap-3">
            <button
              @click="saveModelExample"
              :disabled="modelExampleSaving"
              class="px-4 py-2 text-sm font-medium bg-text text-white rounded-lg hover:bg-text/90 transition-all disabled:opacity-50"
            >
              {{ modelExampleSaving ? '保存中...' : '保存' }}
            </button>
            <span v-if="modelExampleMsg" class="text-sm" :class="modelExampleMsgOk ? 'text-green-600' : 'text-red-500'">
              {{ modelExampleMsg }}
            </span>
          </div>
        </div>

        <!-- ----- 站点品牌 ----- -->

        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-6">
          <div class="mb-4">
            <h2 class="text-lg font-semibold text-text">站点品牌</h2>
            <p class="text-xs text-text-secondary mt-1">配置站点名、Logo、浏览器标签图标。浏览器标签页标题会跟随站点名自动变化。</p>
          </div>

          <div class="space-y-5">
            <!-- 站点名 -->
            <div>
              <label class="block text-sm font-medium text-text mb-1">站点名</label>
              <input
                v-model="brandingForm.site_name"
                type="text"
                maxlength="100"
                class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text text-sm"
                placeholder="AI-Portal"
              />
              <p class="text-xs text-text-secondary mt-1">显示在顶部导航栏 Logo 旁、浏览器标签页标题。最多 100 个字符。</p>
            </div>

            <!-- Logo 上传 -->
            <div>
              <label class="block text-sm font-medium text-text mb-1">站点 Logo</label>
              <div class="flex items-center gap-4">
                <div class="w-16 h-16 rounded-lg border border-[rgba(0,0,0,0.08)] bg-surface-secondary flex items-center justify-center overflow-hidden shrink-0">
                  <img v-if="brandingForm.site_logo" :src="resolveAssetUrl(brandingForm.site_logo)" alt="logo" class="max-w-full max-h-full" />
                  <span v-else class="text-[10px] text-text-tertiary">未配置</span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <label class="px-3 py-1.5 text-xs border border-[rgba(0,0,0,0.1)] rounded-lg cursor-pointer hover:bg-surface-secondary transition-all">
                      <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="hidden" @change="onUploadBranding('logo', $event)" />
                      {{ uploadingLogo ? '上传中...' : (brandingForm.site_logo ? '替换图片' : '上传图片') }}
                    </label>
                    <button
                      v-if="brandingForm.site_logo"
                      @click="brandingForm.site_logo = ''"
                      class="px-3 py-1.5 text-xs text-red-500 border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-red-50 transition-all"
                    >
                      移除
                    </button>
                  </div>
                  <p class="text-xs text-text-secondary mt-1.5 break-all">
                    <span v-if="brandingForm.site_logo">{{ brandingForm.site_logo }}</span>
                    <span v-else>支持 PNG / JPG / SVG / WebP，最大 2 MB</span>
                  </p>
                </div>
              </div>
            </div>

            <!-- Favicon 上传 -->
            <div>
              <label class="block text-sm font-medium text-text mb-1">浏览器标签图标 (Favicon)</label>
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-lg border border-[rgba(0,0,0,0.08)] bg-surface-secondary flex items-center justify-center overflow-hidden shrink-0">
                  <img v-if="brandingForm.site_favicon" :src="resolveAssetUrl(brandingForm.site_favicon)" alt="favicon" class="max-w-full max-h-full" />
                  <span v-else class="text-[9px] text-text-tertiary">未配置</span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <label class="px-3 py-1.5 text-xs border border-[rgba(0,0,0,0.1)] rounded-lg cursor-pointer hover:bg-surface-secondary transition-all">
                      <input type="file" accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,image/webp" class="hidden" @change="onUploadBranding('favicon', $event)" />
                      {{ uploadingFavicon ? '上传中...' : (brandingForm.site_favicon ? '替换图标' : '上传图标') }}
                    </label>
                    <button
                      v-if="brandingForm.site_favicon"
                      @click="brandingForm.site_favicon = ''"
                      class="px-3 py-1.5 text-xs text-red-500 border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-red-50 transition-all"
                    >
                      移除
                    </button>
                  </div>
                  <p class="text-xs text-text-secondary mt-1.5 break-all">
                    <span v-if="brandingForm.site_favicon">{{ brandingForm.site_favicon }}</span>
                    <span v-else>建议 ICO 或 SVG, 32×32 或 64×64</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-6 flex items-center gap-3">
            <button
              @click="saveBranding"
              :disabled="brandingSaving"
              class="px-4 py-2 text-sm font-medium bg-text text-white rounded-lg hover:bg-text/90 transition-all disabled:opacity-50"
            >
              {{ brandingSaving ? '保存中...' : '保存' }}
            </button>
            <span v-if="brandingMsg" class="text-sm" :class="brandingMsgOk ? 'text-green-600' : 'text-red-500'">
              {{ brandingMsg }}
            </span>
          </div>
        </div>

        <!-- ----- 公告横幅 ----- -->

        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-6">
          <div class="mb-4">
            <h2 class="text-lg font-semibold text-text">公告横幅 (顶部滚动条)</h2>
            <p class="text-xs text-text-secondary mt-1">站点顶部蓝色滚动横幅。支持 HTML：<code class="font-mono">&lt;strong&gt;</code>、<code class="font-mono">&lt;a&gt;</code>、<code class="font-mono">&lt;span class="banner-emphasis"&gt;</code>（黄色加粗强调）。保存后<code>&lt;script&gt;</code>、事件属性、<code>javascript:</code> 链接会被自动剥离。</p>
          </div>

          <div class="space-y-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="announcementForm.banner_enabled" class="h-4 w-4 accent-text" />
              <span class="text-sm font-medium text-text">启用顶部滚动横幅</span>
            </label>
            <div>
              <label class="block text-sm font-medium text-text mb-1">横幅内容 (HTML)</label>
              <textarea
                v-model="announcementForm.banner_html"
                rows="5"
                :disabled="!announcementForm.banner_enabled"
                class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text font-mono text-xs leading-[1.7] disabled:opacity-50"
                placeholder="如需高亮关键词,可用 <span class=&quot;banner-emphasis&quot;>关键词</span>"
              ></textarea>
            </div>
          </div>
        </div>

        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-6">
          <div class="mb-4">
            <h2 class="text-lg font-semibold text-text">首次访问详细公告 (居中对话框)</h2>
            <p class="text-xs text-text-secondary mt-1">访客首次进入站点时弹出的详细说明。保存任意变更后，所有曾点过「不再提示」的用户会在下次访问时重新看到此对话框。</p>
          </div>

          <div class="space-y-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="announcementForm.dialog_enabled" class="h-4 w-4 accent-text" />
              <span class="text-sm font-medium text-text">启用首次访问公告</span>
            </label>
            <div>
              <label class="block text-sm font-medium text-text mb-1">对话框标题</label>
              <input
                v-model="announcementForm.dialog_title"
                type="text"
                maxlength="200"
                :disabled="!announcementForm.dialog_enabled"
                class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text text-sm disabled:opacity-50"
                placeholder="例:系统升级通知"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-text mb-1">对话框正文 (HTML)</label>
              <textarea
                v-model="announcementForm.dialog_html"
                rows="12"
                :disabled="!announcementForm.dialog_enabled"
                class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none focus:border-text font-mono text-xs leading-[1.7] disabled:opacity-50"
                placeholder="<p>段落</p>"
              ></textarea>
              <p class="text-xs text-text-secondary mt-1">支持 <code class="font-mono">&lt;p&gt;</code> / <code class="font-mono">&lt;strong&gt;</code> / <code class="font-mono">&lt;a&gt;</code>，特殊样式可用 <code class="font-mono">&lt;div class="dialog-alert"&gt;</code>（黄色提示框）、<code class="font-mono">&lt;p class="dialog-footnote"&gt;</code>（小字脚注）</p>
            </div>
          </div>

          <div class="mt-6 flex items-center gap-3">
            <button
              @click="saveAnnouncement"
              :disabled="announcementSaving"
              class="px-4 py-2 text-sm font-medium bg-text text-white rounded-lg hover:bg-text/90 transition-all disabled:opacity-50"
            >
              {{ announcementSaving ? '保存中...' : '保存公告' }}
            </button>
            <span v-if="announcementMsg" class="text-sm" :class="announcementMsgOk ? 'text-green-600' : 'text-red-500'">
              {{ announcementMsg }}
            </span>
          </div>
        </div>

        </div><!-- /Tab: 站点设置 -->
      </div>
    </main>

    <!-- Confirm Dialog -->
    <Teleport to="body">
      <div v-if="showConfirm" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="showConfirm = false"></div>
        <div class="relative bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
          <h3 class="text-lg font-semibold text-text mb-2">
            {{ confirmTarget === 'cos' ? '切换到 COS 存储' : '切换到本地存储' }}
          </h3>
          <div v-if="confirmTarget === 'cos'" class="text-sm text-text-secondary space-y-2 mb-6">
            <p>确认将文件存储模式从<b>本地磁盘</b>切换到<b>腾讯云 COS</b>？</p>
            <div class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-700">
              <p class="font-medium mb-1">注意事项：</p>
              <ul class="list-disc list-inside space-y-1 text-xs">
                <li>已存储在本地的文件不会自动迁移到 COS</li>
                <li>新上传的文件将存储到 COS</li>
                <li>切换后可随时切回本地磁盘</li>
              </ul>
            </div>
          </div>
          <div v-else class="text-sm text-text-secondary space-y-2 mb-6">
            <p>确认将文件存储模式从<b>腾讯云 COS</b>切换到<b>本地磁盘</b>？</p>
            <div class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-700">
              <p class="font-medium mb-1">注意事项：</p>
              <ul class="list-disc list-inside space-y-1 text-xs">
                <li>已存储在 COS 的文件不会自动下载到本地</li>
                <li>新上传的文件将存储到本地磁盘</li>
                <li>切换后可随时切回 COS</li>
              </ul>
            </div>
          </div>
          <div class="flex items-center gap-3 justify-end">
            <button
              @click="showConfirm = false"
              class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all"
            >
              取消
            </button>
            <button
              @click="doSwitch"
              :disabled="switching"
              class="px-5 py-2 text-sm font-medium text-white rounded-lg transition-all disabled:opacity-50"
              :class="confirmTarget === 'cos' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-text hover:bg-text/90'"
            >
              {{ switching ? '切换中...' : '确认切换' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '../components/NavBar.vue'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))
const router = useRouter()

const loading = ref(true)
const showKey = ref(false)

// Tab 切换 + URL hash 双向同步
const tabs = [
  { id: 'panel',   label: '1Panel 网关' },
  { id: 'site',    label: '站点设置' },
]
const VALID_TAB_IDS = tabs.map(t => t.id)

// 从 location.hash 读出有效 tab id,无效或缺失则落到 storage
// 历史兼容: example/branding/announcement 这三个 id 已被合并到 site,把它们重定向过去
const HASH_REDIRECT = { example: 'site', branding: 'site', announcement: 'site' }
const readTabFromHash = () => {
  const raw = (typeof location !== 'undefined' && location.hash || '').replace(/^#/, '')
  if (HASH_REDIRECT[raw]) return HASH_REDIRECT[raw]
  return VALID_TAB_IDS.includes(raw) ? raw : 'panel'
}

const activeTab = ref(readTabFromHash())

// 切 Tab 时同步到 hash:用 replaceState 不污染浏览历史(避免每点一次都生成一条 history entry)
watch(activeTab, (id) => {
  if (typeof location === 'undefined') return
  const target = '#' + id
  if (location.hash !== target) {
    history.replaceState(null, '', target)
  }
})

// 监听 hashchange:用户用浏览器前进/后退,或手动改地址栏 #panel 等,Tab 跟着切
const onHashChange = () => {
  const next = readTabFromHash()
  if (next !== activeTab.value) activeTab.value = next
}
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', onHashChange)
}
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('hashchange', onHashChange)
  }
})

// Active mode (from server)
const activeStorageType = ref('local')

// Form data
const form = ref({
  storageType: 'local',
  localPath: '',
  cosSecretId: '',
  cosSecretKey: '',
  cosBucket: '',
  cosRegion: 'ap-guangzhou',
})

// Local path save
const savingLocal = ref(false)
const localSaveMsg = ref('')
const localSaveOk = ref(false)

// COS save & test
const savingCOS = ref(false)
const cosSaveMsg = ref('')
const cosSaveOk = ref(false)
const testing = ref(false)
const testResult = ref('')
const testSuccess = ref(false)

// Switch dialog
const showConfirm = ref(false)
const confirmTarget = ref('cos')
const switching = ref(false)

// 1Panel config
const showPanelKey = ref(false)
const panelForm = ref({
  baseUrl: '',
  apiKey: '',
  apiKeyConfigured: false,
  timeout: 10000,
  syncEnabled: true,
  syncIntervalMinutes: 10,
  skillUploadEnabled: false,
  skillSubmitEnabled: false,
  lastSync: {},
})
const panelTesting = ref(false)
const panelSyncing = ref(false)
const panelSaving = ref(false)
const panelMsg = ref('')
const panelMsgOk = ref(false)
const panelRoles = ref([])

// 调用示例配置
const modelExampleForm = ref({ endpoint: '', template: '' })
const modelExampleSaving = ref(false)
const modelExampleMsg = ref('')
const modelExampleMsgOk = ref(false)
// 模板里展示「{{xxx}}」字面量,Vue 模板里 {{ }} 会被当插值,所以走 ref 输出
const ph = { baseUrl: '{{base_url}}', modelName: '{{model_name}}', apiKey: '{{api_key}}' }

const fetchModelExample = async () => {
  try {
    const res = await fetch(`${API_BASE}/admin/model-example`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.ok) {
      const data = await res.json()
      modelExampleForm.value.endpoint = data.endpoint || ''
      modelExampleForm.value.template = data.template || ''
    }
  } catch (e) { console.error('Failed to fetch model example config:', e) }
}

const saveModelExample = async () => {
  modelExampleSaving.value = true
  modelExampleMsg.value = ''
  try {
    const res = await fetch(`${API_BASE}/admin/model-example`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(modelExampleForm.value),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      modelExampleMsg.value = '已保存,刷新前台模型页生效'
      modelExampleMsgOk.value = true
    } else {
      modelExampleMsg.value = data.error || '保存失败'
      modelExampleMsgOk.value = false
    }
  } catch (e) {
    modelExampleMsg.value = '网络异常'
    modelExampleMsgOk.value = false
  } finally {
    modelExampleSaving.value = false
    setTimeout(() => { modelExampleMsg.value = '' }, 4000)
  }
}

// ============ 站点品牌 ============
const brandingForm = ref({ site_name: '', site_logo: '', site_favicon: '' })
const brandingSaving = ref(false)
const brandingMsg = ref('')
const brandingMsgOk = ref(false)
const uploadingLogo = ref(false)
const uploadingFavicon = ref(false)

// 把 admin 后台拿到的 /uploads/xx.png 拼成完整可用 URL
// 配合 BASE_PATH(子路径部署)和外链(http(s)://...) 两种情况
const resolveAssetUrl = (url) => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  const base = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__'))
    ? window.__APP_BASE__ : '/'
  return url.startsWith('/') ? base.replace(/\/$/, '') + url : url
}

const loadBranding = async () => {
  try {
    const res = await fetch(`${API_BASE}/admin/branding`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    if (res.ok) {
      const data = await res.json()
      brandingForm.value = {
        site_name:    data.site_name    || '',
        site_logo:    data.site_logo    || '',
        site_favicon: data.site_favicon || '',
      }
    }
  } catch (e) { console.error('加载站点品牌失败:', e) }
}

const onUploadBranding = async (kind, ev) => {
  const file = ev?.target?.files?.[0]
  if (!file) return
  // 清空 input.value 让同名重传也能触发 change
  ev.target.value = ''
  const flag = kind === 'favicon' ? uploadingFavicon : uploadingLogo
  flag.value = true
  brandingMsg.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API_BASE}/admin/branding/upload/${kind}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` }, // 不要手动设 Content-Type, fetch 会带 boundary
      body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.url) {
      if (kind === 'favicon') brandingForm.value.site_favicon = data.url
      else brandingForm.value.site_logo = data.url
      brandingMsg.value = '上传成功,记得点「保存」让设置生效'
      brandingMsgOk.value = true
    } else {
      brandingMsg.value = data.error || '上传失败'
      brandingMsgOk.value = false
    }
  } catch (e) {
    brandingMsg.value = '网络异常'
    brandingMsgOk.value = false
  } finally {
    flag.value = false
    setTimeout(() => { brandingMsg.value = '' }, 5000)
  }
}

const saveBranding = async () => {
  if (!brandingForm.value.site_name.trim()) {
    brandingMsg.value = '站点名不能为空'
    brandingMsgOk.value = false
    return
  }
  brandingSaving.value = true
  brandingMsg.value = ''
  try {
    const res = await fetch(`${API_BASE}/admin/branding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(brandingForm.value),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      brandingMsg.value = '已保存,刷新浏览器生效'
      brandingMsgOk.value = true
    } else {
      brandingMsg.value = data.error || '保存失败'
      brandingMsgOk.value = false
    }
  } catch (e) {
    brandingMsg.value = '网络异常'
    brandingMsgOk.value = false
  } finally {
    brandingSaving.value = false
    setTimeout(() => { brandingMsg.value = '' }, 4000)
  }
}

// ============ 公告横幅 ============
const announcementForm = ref({
  banner_enabled: true, banner_html: '',
  dialog_enabled: true, dialog_title: '', dialog_html: '',
})
const announcementSaving = ref(false)
const announcementMsg = ref('')
const announcementMsgOk = ref(false)

const loadAnnouncement = async () => {
  try {
    const res = await fetch(`${API_BASE}/admin/announcement`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    if (res.ok) {
      const data = await res.json()
      announcementForm.value = {
        banner_enabled: data.banner_enabled !== false,
        banner_html:    data.banner_html    || '',
        dialog_enabled: data.dialog_enabled !== false,
        dialog_title:   data.dialog_title   || '',
        dialog_html:    data.dialog_html    || '',
      }
    }
  } catch (e) { console.error('加载公告失败:', e) }
}

const saveAnnouncement = async () => {
  announcementSaving.value = true
  announcementMsg.value = ''
  try {
    const res = await fetch(`${API_BASE}/admin/announcement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(announcementForm.value),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      announcementMsg.value = '已保存,刷新前台立即生效。曾点「不再提示」的用户会重新看到对话框。'
      announcementMsgOk.value = true
    } else {
      announcementMsg.value = data.error || '保存失败'
      announcementMsgOk.value = false
    }
  } catch (e) {
    announcementMsg.value = '网络异常'
    announcementMsgOk.value = false
  } finally {
    announcementSaving.value = false
    setTimeout(() => { announcementMsg.value = '' }, 6000)
  }
}

const formatDate = (s) => {
  if (!s) return ''
  try {
    return new Date(s).toLocaleString('zh-CN', { hour12: false })
  } catch { return s }
}

const cosConfigured = computed(() => {
  return !!(form.value.cosSecretId && form.value.cosBucket)
})

const getToken = () => localStorage.getItem('admin_token')

const fetchConfig = async () => {
  try {
    const res = await fetch(`${API_BASE}/admin/config`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    })
    if (res.ok) {
      const data = await res.json()
      activeStorageType.value = data.storageType || 'local'
      form.value = {
        storageType: data.storageType || 'local',
        localPath: data.localPath || '',
        cosSecretId: data.cosSecretId || '',
        cosSecretKey: data.cosSecretKey || '',
        cosBucket: data.cosBucket || '',
        cosRegion: data.cosRegion || 'ap-guangzhou',
      }
    } else if (res.status === 401) {
      localStorage.removeItem('admin_token')
      router.push('/admin/login')
    }
  } catch (err) {
    console.error('Error:', err)
  } finally {
    loading.value = false
  }
}

const saveLocalPath = async () => {
  savingLocal.value = true
  localSaveMsg.value = ''
  try {
    const res = await fetch(`${API_BASE}/admin/config`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        storageType: activeStorageType.value,
        localPath: form.value.localPath,
      }),
    })
    if (res.ok) {
      localSaveMsg.value = '路径已保存'
      localSaveOk.value = true
    } else {
      localSaveMsg.value = '保存失败'
      localSaveOk.value = false
    }
  } catch {
    localSaveMsg.value = '网络错误'
    localSaveOk.value = false
  } finally {
    savingLocal.value = false
    setTimeout(() => { localSaveMsg.value = '' }, 3000)
  }
}

const saveCOSConfig = async () => {
  savingCOS.value = true
  cosSaveMsg.value = ''
  try {
    const body = {
      storageType: activeStorageType.value,
      cosSecretId: form.value.cosSecretId,
      cosBucket: form.value.cosBucket,
      cosRegion: form.value.cosRegion,
    }
    if (form.value.cosSecretKey) {
      body.cosSecretKey = form.value.cosSecretKey
    }
    const res = await fetch(`${API_BASE}/admin/config`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      cosSaveMsg.value = '配置已保存'
      cosSaveOk.value = true
    } else {
      cosSaveMsg.value = '保存失败'
      cosSaveOk.value = false
    }
  } catch {
    cosSaveMsg.value = '网络错误'
    cosSaveOk.value = false
  } finally {
    savingCOS.value = false
    setTimeout(() => { cosSaveMsg.value = '' }, 3000)
  }
}

const testCOS = async () => {
  testing.value = true
  testResult.value = ''
  try {
    const res = await fetch(`${API_BASE}/admin/config/test-cos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cosSecretId: form.value.cosSecretId,
        cosSecretKey: form.value.cosSecretKey,
        cosBucket: form.value.cosBucket,
        cosRegion: form.value.cosRegion,
      }),
    })
    const data = await res.json()
    testResult.value = data.success ? '连接成功' : data.error
    testSuccess.value = data.success
  } catch {
    testResult.value = '网络错误'
    testSuccess.value = false
  } finally {
    testing.value = false
    setTimeout(() => { testResult.value = '' }, 5000)
  }
}

const confirmSwitch = (target) => {
  confirmTarget.value = target
  showConfirm.value = true
}

const doSwitch = async () => {
  switching.value = true
  try {
    const body = {
      storageType: confirmTarget.value,
      localPath: form.value.localPath,
      cosSecretId: form.value.cosSecretId,
      cosBucket: form.value.cosBucket,
      cosRegion: form.value.cosRegion,
    }
    if (form.value.cosSecretKey) {
      body.cosSecretKey = form.value.cosSecretKey
    }
    // COS switch: validate connection first
    if (confirmTarget.value === 'cos') {
      const testRes = await fetch(`${API_BASE}/admin/config/test-cos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cosSecretId: form.value.cosSecretId,
          cosSecretKey: form.value.cosSecretKey,
          cosBucket: form.value.cosBucket,
          cosRegion: form.value.cosRegion,
        }),
      })
      const testData = await testRes.json()
      if (!testData.success) {
        alert('COS 连接失败: ' + testData.error + '\n请先配置并测试通过后再切换')
        switching.value = false
        showConfirm.value = false
        return
      }
    }
    const res = await fetch(`${API_BASE}/admin/config`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      activeStorageType.value = confirmTarget.value
      showConfirm.value = false
    } else {
      alert('切换失败，请重试')
    }
  } catch {
    alert('网络错误')
  } finally {
    switching.value = false
  }
}

const logout = () => {
  localStorage.removeItem('admin_token')
  router.push('/admin/login')
}

// ============ 1Panel 配置 ============

const fetchPanelConfig = async () => {
  try {
    const res = await fetch(`${API_BASE}/admin/panel-config`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    })
    if (res.ok) {
      const data = await res.json()
      panelForm.value = {
        baseUrl: data.baseUrl || '',
        apiKey: '', // 不回填,留空表示保留原值;输入新值才覆盖
        apiKeyConfigured: !!data.apiKeyConfigured,
        timeout: data.timeout || 10000,
        syncEnabled: data.syncEnabled !== false,
        syncIntervalMinutes: data.syncIntervalMinutes || 10,
        skillUploadEnabled: data.skillUploadEnabled === true,
        skillSubmitEnabled: data.skillSubmitEnabled === true,
        userRoleId: data.panelUserRoleId || 4,
        lastSync: data.lastSync || {},
      }
      panelRoles.value = data.panelRoles || []
    }
  } catch (err) {
    console.error('Error fetch panel config:', err)
  }
}

const savePanelConfig = async () => {
  panelSaving.value = true
  panelMsg.value = ''
  try {
    const body = {
      baseUrl: panelForm.value.baseUrl,
      timeout: panelForm.value.timeout,
      syncEnabled: panelForm.value.syncEnabled,
      syncIntervalMinutes: panelForm.value.syncIntervalMinutes,
      skillUploadEnabled: panelForm.value.skillUploadEnabled,
      skillSubmitEnabled: panelForm.value.skillSubmitEnabled,
      panelUserRoleId: panelForm.value.userRoleId,
    }
    if (panelForm.value.apiKey && !panelForm.value.apiKey.startsWith('****')) {
      body.apiKey = panelForm.value.apiKey
    }
    const res = await fetch(`${API_BASE}/admin/panel-config`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      panelMsg.value = '配置已保存'
      panelMsgOk.value = true
      // 清空输入框并刷新状态
      panelForm.value.apiKey = ''
      await fetchPanelConfig()
    } else {
      const data = await res.json().catch(() => ({}))
      panelMsg.value = data.error || '保存失败'
      panelMsgOk.value = false
    }
  } catch {
    panelMsg.value = '网络错误'
    panelMsgOk.value = false
  } finally {
    panelSaving.value = false
    setTimeout(() => { panelMsg.value = '' }, 4000)
  }
}

const testPanel = async () => {
  panelTesting.value = true
  panelMsg.value = ''
  try {
    const body = {
      baseUrl: panelForm.value.baseUrl,
      timeout: panelForm.value.timeout,
    }
    if (panelForm.value.apiKey) body.apiKey = panelForm.value.apiKey
    const res = await fetch(`${API_BASE}/admin/panel-config/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    panelMsg.value = data.success ? (data.message || '连接成功') : (data.error || '连接失败')
    panelMsgOk.value = !!data.success
  } catch {
    panelMsg.value = '网络错误'
    panelMsgOk.value = false
  } finally {
    panelTesting.value = false
    setTimeout(() => { panelMsg.value = '' }, 5000)
  }
}

const syncNow = async () => {
  panelSyncing.value = true
  panelMsg.value = ''
  try {
    const res = await fetch(`${API_BASE}/admin/panel-config/sync-now`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
    })
    const data = await res.json()
    if (data.success) {
      const m = data.models, s = data.skills
      const parts = []
      if (m?.ok) parts.push(`模型 ${m.modelCount || 0}`)
      else parts.push(`模型 失败: ${m?.error || '未知'}`)
      if (s?.ok) parts.push(`技能 ${s.upsertCount || 0}`)
      else parts.push(`技能 失败: ${s?.error || '未知'}`)
      panelMsg.value = '同步完成: ' + parts.join(' | ')
      panelMsgOk.value = true
      await fetchPanelConfig()
    } else {
      panelMsg.value = data.error || '同步失败'
      panelMsgOk.value = false
    }
  } catch {
    panelMsg.value = '网络错误'
    panelMsgOk.value = false
  } finally {
    panelSyncing.value = false
    setTimeout(() => { panelMsg.value = '' }, 6000)
  }
}

onMounted(() => {
  if (!getToken()) {
    router.push('/admin/login')
    return
  }
  fetchConfig()
  fetchPanelConfig()
  fetchModelExample()
  loadBranding()
  loadAnnouncement()
})
</script>
