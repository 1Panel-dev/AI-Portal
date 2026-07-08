<template>
  <div>
    <NavBar />
    <main class="max-w-[1024px] mx-auto px-6 pt-[132px] pb-20 animate-fade-up">
      <h1 class="text-[24px] font-bold text-text mb-8">个人中心</h1>
      <div class="flex flex-col md:flex-row gap-6">
        <!-- Left Menu -->
        <nav class="w-full md:w-[200px] shrink-0">
          <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-2 shadow-card">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              @click="activeTab = tab.id"
              class="w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors"
              :class="activeTab === tab.id
                ? 'bg-surface-secondary font-medium text-text'
                : 'text-text-secondary hover:text-text hover:bg-surface-secondary/50'"
            >
              {{ tab.label }}
            </button>
          </div>
        </nav>

        <!-- Right Content -->
        <div class="flex-1 min-w-0">
          <!-- 欢迎横幅(skip 后跳来时显示一次,在基础信息上方) -->
          <div v-if="activeTab === 'info' && showWelcomeBanner" class="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div class="flex items-start gap-3">
              <span class="text-amber-600 text-lg leading-none">👋</span>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-text">欢迎!您的账号已通过企业微信信息创建完成。</p>
                <p class="text-xs text-text-secondary mt-1">建议在下方设置一个登录密码,以便日后从其他设备使用密码登录。</p>
              </div>
              <button @click="showWelcomeBanner = false" class="text-text-secondary hover:text-text text-sm leading-none">✕</button>
            </div>
          </div>

          <!-- Basic Info -->
          <div v-if="activeTab === 'info'" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-card">
            <h2 class="text-lg font-semibold text-text mb-6">基础信息</h2>
            <div class="space-y-5">
              <div class="flex items-center justify-between py-3 border-b border-[rgba(0,0,0,0.06)]">
                <span class="text-sm text-text-secondary">用户名</span>
                <span class="text-sm text-text font-medium">{{ user.username }}</span>
              </div>
              <div class="flex items-center justify-between py-3 border-b border-[rgba(0,0,0,0.06)]">
                <span class="text-sm text-text-secondary">显示名</span>
                <span class="text-sm text-text">{{ user.name || '-' }}</span>
              </div>
              <div class="flex items-center justify-between py-3 border-b border-[rgba(0,0,0,0.06)]">
                <span class="text-sm text-text-secondary">角色</span>
                <span class="text-sm text-text">
                  <span v-if="user.role === 'admin'" class="text-indigo-600 font-medium">管理员</span>
                  <span v-else>普通用户</span>
                </span>
              </div>
              <div class="flex items-center justify-between py-3 border-b border-[rgba(0,0,0,0.06)]">
                <span class="text-sm text-text-secondary">注册时间</span>
                <span class="text-sm text-text">{{ formatDate(user.created_at) }}</span>
              </div>
              <div class="flex items-center justify-between py-3">
                <span class="text-sm text-text-secondary">最近登录</span>
                <span class="text-sm text-text">{{ formatDate(user.last_login_at) }}</span>
              </div>
            </div>
            <div class="mt-3 flex justify-end gap-3">
              <button v-if="isAdmin" @click="goToAdmin" class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors">进入管理后台</button>
              <button @click="openChangePasswordDialog" class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.12)] text-text-secondary rounded-lg hover:bg-surface-secondary transition-colors">修改密码</button>
            </div>
            <div class="mt-8 pt-5 border-t border-[rgba(0,0,0,0.06)] flex justify-end">
              <button @click="logout" class="px-4 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors">退出登录</button>
            </div>
          </div>

          <!-- 账号绑定卡片 -->
          <div v-if="activeTab === 'info'" class="mt-6 bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-card">
            <h2 class="text-lg font-semibold text-text mb-4">账号绑定</h2>
            <div v-if="allProviders.length === 0" class="text-sm text-text-secondary py-2">
              暂无可绑定的第三方登录方式
            </div>
            <div v-else class="space-y-1">
              <div v-for="p in allProviders" :key="p.provider"
                class="flex items-center justify-between py-3 border-b border-[rgba(0,0,0,0.06)] last:border-b-0">
                <div class="min-w-0 flex-1 pr-3">
                  <div class="text-sm font-medium text-text">{{ p.display_name }}</div>
                  <div v-if="findBoundIdentity(p.provider)" class="text-xs text-text-secondary mt-1 truncate">
                    已绑定:{{ findBoundIdentity(p.provider).profile?.name || findBoundIdentity(p.provider).external_id }}
                  </div>
                  <div v-else class="text-xs text-text-tertiary mt-1">未绑定</div>
                </div>
                <button v-if="findBoundIdentity(p.provider) && (hasPassword || !autoCreatedFrom)"
                  @click="unbindProvider(p.provider)"
                  class="shrink-0 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                  解绑
                </button>
                <button v-else-if="!findBoundIdentity(p.provider)"
                  @click="startBindProvider(p.provider)"
                  class="shrink-0 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors">
                  绑定
                </button>
              </div>
            </div>
          </div>

          <!-- 设置密码卡片(仅自动创建用户首次设置时显示) -->
          <div v-if="activeTab === 'info' && autoCreatedFrom && !hasPassword"
            class="mt-6 bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-card">
            <h2 class="text-lg font-semibold text-text mb-2">设置登录密码</h2>
            <p class="text-sm text-text-secondary mb-4">
              您的账号由企业微信自动创建,尚未设置登录密码。设置后可使用用户名 + 密码登录。
            </p>
            <div class="space-y-3 max-w-md">
              <input v-model="setPwdNew" type="password" placeholder="新密码(至少 6 位)"
                class="w-full px-3 py-2.5 border border-[rgba(0,0,0,0.1)] rounded-xl text-sm outline-none transition-colors focus:border-text focus:ring-1 focus:ring-text/20" />
              <input v-model="setPwdConfirm" type="password" placeholder="再次输入新密码"
                class="w-full px-3 py-2.5 border border-[rgba(0,0,0,0.1)] rounded-xl text-sm outline-none transition-colors focus:border-text focus:ring-1 focus:ring-text/20" />
              <p v-if="setPasswordError" class="text-xs text-red-500">{{ setPasswordError }}</p>
              <p v-if="setPasswordSuccess" class="text-xs text-emerald-600">密码已设置成功</p>
              <button @click="setPasswordForAutoUser" :disabled="settingPassword"
                class="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
                {{ settingPassword ? '设置中...' : '保存密码' }}
              </button>
            </div>
          </div>

          <!-- API Keys -->
          <div v-if="activeTab === 'keys'" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-card">
            <p v-if="keyError" class="text-sm mb-4" :class="keyErrorOk ? 'text-emerald-600' : 'text-red-500'">{{ keyError }}</p>
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-2">
                <h2 class="text-lg font-semibold text-text">API Key 管理</h2>
                <button @click="refreshKeys" :disabled="keysLoading" :title="keysLoading ? '加载中' : '刷新'"
                  class="w-7 h-7 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text hover:bg-surface-secondary transition-all disabled:opacity-40 cursor-pointer border-none bg-transparent">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="{ 'animate-spin': keysLoading }"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
              </div>
              <div v-if="apiKeyData" class="flex items-center gap-2">
                <button @click="openResetDialog" :disabled="resettingKey || deletingKey"
                  class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.12)] text-text-secondary rounded-lg hover:bg-surface-secondary transition-all disabled:opacity-50">
                  {{ resettingKey ? '重置中...' : '重置 Key' }}
                </button>
                <button @click="openDeleteDialog" :disabled="resettingKey || deletingKey"
                  class="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-all disabled:opacity-50">
                  {{ deletingKey ? '删除中...' : '删除 Key' }}
                </button>
              </div>
            </div>

            <!-- Loading -->
            <div v-if="keysLoading" class="py-10 text-center text-text-secondary text-sm">加载中...</div>

            <!-- No key -->
            <div v-else-if="!apiKeyData" class="py-12 text-center">
              <div class="w-12 h-12 bg-surface-secondary rounded-full mx-auto mb-3 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="1.5">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                </svg>
              </div>
              <p class="text-text-secondary text-sm mb-4">暂无 API Key</p>
              <button @click="createKey" :disabled="creatingKey"
                class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-all disabled:opacity-50">
                {{ creatingKey ? '创建中...' : '申请 API Key' }}
              </button>
            </div>

            <!-- Single Key Card -->
            <div v-else class="border border-[rgba(0,0,0,0.06)] rounded-xl px-5 py-4">
              <!-- 调用地址(Base URL):与 key 同属凭证上下文,放卡片顶部,免去切换模型广场 -->
              <div class="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-[rgba(0,0,0,0.06)]">
                <div class="min-w-0 flex-1">
                  <div class="text-xs text-text-tertiary mb-0.5">调用地址 (Base URL)</div>
                  <div v-if="baseUrl" class="text-sm text-text font-mono truncate">{{ baseUrl }}</div>
                  <div v-else class="text-xs text-text-secondary">尚未配置，请让管理员在系统配置中设置调用地址</div>
                </div>
                <button v-if="baseUrl" @click="copyBaseUrl"
                  class="shrink-0 px-3 py-1.5 text-xs border border-[rgba(0,0,0,0.12)] text-text-secondary rounded-lg hover:bg-surface-secondary transition-all flex items-center gap-1.5"
                  :class="{ '!border-green-300 !text-green-600': copiedBaseUrl }">
                  <svg v-if="!copiedBaseUrl" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {{ copiedBaseUrl ? '已复制' : '复制' }}
                </button>
              </div>
              <div class="flex items-center gap-2 mb-3">
                <span class="text-sm font-medium text-text font-mono tracking-wide">{{ apiKeyData.api_key_mask }}</span>
                <span v-if="apiKeyData.status === 'Enable'"
                  class="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">启用</span>
                <span v-else
                  class="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded">禁用</span>
              </div>
              <div class="text-xs text-text-tertiary mb-4">创建于 {{ formatDate(apiKeyData.created_at) }}</div>
              <div class="flex items-center gap-3">
                <button @click="copyFullKey"
                  class="px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-all flex items-center gap-1.5"
                  :class="{ '!bg-green-600': copied }">
                  <svg v-if="!copied" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {{ copied ? '已复制' : '复制 Key' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Token 用量统计 -->
          <div v-if="activeTab === 'keys' && apiKeyData" class="mt-6 bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-card">
            <h2 class="text-lg font-semibold text-text mb-5 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#005eeb" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Token 用量统计
            </h2>
            <div v-if="usageLoading" class="py-8 text-center text-text-secondary text-sm">加载中...</div>
            <div v-else-if="usageError" class="py-4 text-center text-red-500 text-sm">{{ usageError }}</div>
            <div v-else>
              <!-- Token 配额 -->
              <div v-if="apiKeyData.token_limit || apiKeyData.token_unlimited" class="mb-6 bg-[#f5f9ff] rounded-xl px-5 py-4">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[13px] font-medium text-text">Token 配额</span>
                  <span class="text-[12px] text-text-secondary font-mono">{{ fmtNum(apiKeyData.token_used) }} / {{ apiKeyData.token_unlimited ? '∞' : fmtNum(apiKeyData.token_limit) }}</span>
                </div>
                <div v-if="!apiKeyData.token_unlimited" class="h-2 bg-[rgba(0,0,0,0.06)] rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all"
                    :class="(apiKeyData.token_used||0)/(apiKeyData.token_limit||1) > 0.9 ? 'bg-red-400' : (apiKeyData.token_used||0)/(apiKeyData.token_limit||1) > 0.7 ? 'bg-amber-400' : 'bg-accent'"
                    :style="{ width: Math.min((apiKeyData.token_used||0)/(apiKeyData.token_limit||1)*100,100) + '%' }"></div>
                </div>
              </div>
              <!-- Summary 卡片 -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div class="bg-[#f5f9ff] rounded-xl px-4 py-3 text-center"><div class="text-[22px] font-bold text-accent">{{ fmtNum(usageData.summary?.requestCount) }}</div><div class="text-[11px] text-text-tertiary mt-1">总请求</div></div>
                <div class="bg-[#f5f9ff] rounded-xl px-4 py-3 text-center"><div class="text-[22px] font-bold text-accent">{{ fmtNum(usageData.summary?.totalTokens) }}</div><div class="text-[11px] text-text-tertiary mt-1">总 Token</div></div>
                <div class="bg-[#f5f5f7] rounded-xl px-4 py-3 text-center"><div class="text-[22px] font-bold text-text">{{ fmtNum(usageData.summary?.cachedTokens) }}</div><div class="text-[11px] text-text-tertiary mt-1">缓存命中</div></div>
                <div class="bg-[#f5f5f7] rounded-xl px-4 py-3 text-center"><div class="text-[22px] font-bold" :class="(usageData.summary?.failedRequests||0)>0?'text-red-500':'text-text'">{{ fmtNum(usageData.summary?.failedRequests) }}</div><div class="text-[11px] text-text-tertiary mt-1">失败请求</div></div>
              </div>
              <!-- Token 堆叠柱状图 -->
              <div class="mb-6">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-[13px] font-semibold text-text">每月 Token 统计</h3>
                  <select v-model="selectedYM" class="px-2.5 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-lg text-[13px] bg-white outline-none cursor-pointer">
                    <option v-for="o in monthOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                </div>
                <div class="relative bg-[#fafafa] rounded-xl p-4" style="min-height: 268px;">
                  <div ref="tokenChartRef" style="height:260px"></div>
                  <div v-if="!filteredTrends.length" class="absolute inset-0 flex items-center justify-center text-[13px] text-text-tertiary">{{ monthLabel }} 暂无数据</div>
                </div>
              </div>

              <!-- 请求次数折线图 -->
              <div class="mb-6">
                <h3 class="text-[13px] font-semibold text-text mb-3">每月请求次数</h3>
                <div class="relative bg-[#fafafa] rounded-xl p-4" style="min-height: 268px;">
                  <div ref="reqChartRef" style="height:260px"></div>
                  <div v-if="!filteredTrends.length" class="absolute inset-0 flex items-center justify-center text-[13px] text-text-tertiary">{{ monthLabel }} 暂无数据</div>
                </div>
              </div>
              <!-- 模型用量横向柱状图 -->
              <div>
                <h3 class="text-[13px] font-semibold text-text mb-3">模型用量</h3>
                <div v-if="usageData.models?.length" class="bg-[#fafafa] rounded-xl p-4">
                  <div class="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    <div v-for="(m, mi) in sortedModels" :key="m.name"
                      class="flex items-center gap-2"
                      @mouseenter="onModelEnter($event, m)" @mousemove="onModelMove($event)" @mouseleave="onModelLeave">
                      <span class="text-[12px] text-text w-[120px] shrink-0 truncate text-right" :title="m.name">{{ m.name }}</span>
                      <div class="flex-1 h-5 bg-white rounded relative overflow-hidden">
                        <div class="absolute inset-y-0 left-0 rounded transition-colors"
                          :class="modelHover?.name === m.name ? 'bg-accent' : 'bg-accent/70'"
                          :style="{ width: modelPct(m) + '%' }"></div>
                      </div>
                      <span class="text-[12px] text-text-secondary font-mono w-[60px] shrink-0 text-right">{{ fmtNum(m.totalTokens) }}</span>
                    </div>
                  </div>
                </div>
                <div v-else class="bg-[#fafafa] rounded-xl py-8 text-center text-[13px] text-text-tertiary">暂无数据</div>
              </div>
            </div>
          </div>

          <div v-if="activeTab === 'skills'" class="space-y-6">
            <SkillctlGuide />
            <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-card">
              <div class="flex items-center justify-between gap-3 mb-6">
                <h2 class="text-lg font-semibold text-text">{{ isAdmin ? '技能审核' : '我的技能' }}</h2>
                <router-link v-if="!isAdmin && featureFlags.skillSubmitEnabled" to="/submit" class="shrink-0 px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-all no-underline">提交技能</router-link>
              </div>
              <div v-if="mySkillsLoading" class="py-10 text-center text-text-secondary text-sm">加载中...</div>
              <div v-else-if="mySkills.length === 0" class="py-12 text-center">
                <div class="w-12 h-12 bg-surface-secondary rounded-full mx-auto mb-3 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="1.5"><path d="M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z"/><path d="M9 12l2 2 4-4"/></svg>
                </div>
                <p class="text-text-secondary text-sm">{{ isAdmin ? '暂无待审核的技能' : '暂未提交任何技能' }}</p>
              </div>
              <div v-else class="space-y-3">
                <div v-for="skill in mySkills" :key="skill.id" class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border border-[rgba(0,0,0,0.06)] rounded-xl">
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-text truncate">{{ skill.title }}</div>
                    <div class="text-xs text-text-tertiary mt-0.5 truncate">{{ skill.skill_id }} · {{ skill.category }}</div>
                    <div v-if="skill.package_name" class="text-xs text-text-tertiary mt-1 truncate">技能包：{{ skill.package_name }}</div>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <span class="w-fit text-xs px-2 py-0.5 rounded-full"
                      :class="skill.status === 'pending' ? 'text-amber-600 bg-amber-50' : skill.status === 'approved' ? 'text-green-600 bg-green-50' : skill.status === 'deleted' ? 'text-slate-600 bg-slate-100' : 'text-red-500 bg-red-50'">
                      {{ skill.status === 'pending' ? '待审核' : skill.status === 'approved' ? '已通过' : skill.status === 'deleted' ? '已删除' : '已拒绝' }}
                    </span>
                    <button v-if="skill.status !== 'rejected' && skill.status !== 'deleted'" @click="openSkillDetail(skill)" class="px-2.5 py-1 text-xs text-text-secondary border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary hover:text-text transition-colors">查看</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>


    <SkillDetailModal
      :skill="selectedSkill"
      :is-open="!!selectedSkill"
      @close="selectedSkill = null"
    />

    <Teleport to="body">
      <div
        v-if="showResetDialog"
        class="fixed inset-0 z-[220] flex items-center justify-center bg-[rgba(0,0,0,0.42)] backdrop-blur-[10px] px-5 py-8"
        @click="closeResetDialog"
      >
        <div
          class="w-full max-w-[420px] overflow-hidden rounded-modal bg-white shadow-modal animate-modal-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-key-title"
          @click.stop
        >
          <div class="px-6 pt-6 pb-5">
            <div class="mb-5 flex items-start gap-4">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-red-50 text-red-500">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                </svg>
              </div>
              <div class="min-w-0 flex-1">
                <h3 id="reset-key-title" class="text-[18px] font-semibold leading-6 text-text">重置 API Key</h3>
                <p class="mt-2 text-sm leading-6 text-text-secondary">重置后旧 Key 将立即失效，请确认现有服务已经准备切换到新的 Key。</p>
              </div>
            </div>

            <div v-if="apiKeyData?.api_key_mask" class="rounded-xl border border-[rgba(0,0,0,0.06)] bg-surface-secondary px-4 py-3">
              <div class="mb-1 text-xs text-text-tertiary">当前 Key</div>
              <div class="break-all font-mono text-sm font-medium text-text">{{ apiKeyData.api_key_mask }}</div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 border-t border-[rgba(0,0,0,0.06)] bg-[rgba(245,245,247,0.72)] px-6 py-4">
            <button
              @click="closeResetDialog"
              :disabled="resettingKey"
              class="rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2 text-sm font-medium text-text transition-all hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              取消
            </button>
            <button
              @click="confirmResetKey"
              :disabled="resettingKey"
              class="rounded-[10px] bg-accent px-4 py-2 text-sm font-medium text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {{ resettingKey ? '重置中...' : '确认重置' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="showDeleteDialog"
        class="fixed inset-0 z-[220] flex items-center justify-center bg-[rgba(0,0,0,0.42)] backdrop-blur-[10px] px-5 py-8"
        @click="closeDeleteDialog"
      >
        <div
          class="w-full max-w-[420px] overflow-hidden rounded-modal bg-white shadow-modal animate-modal-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-key-title"
          @click.stop
        >
          <div class="px-6 pt-6 pb-5">
            <div class="mb-5 flex items-start gap-4">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-red-50 text-red-500">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
              </div>
              <div class="min-w-0 flex-1">
                <h3 id="delete-key-title" class="text-[18px] font-semibold leading-6 text-text">删除 API Key</h3>
                <p class="mt-2 text-sm leading-6 text-text-secondary">删除后该 Key 立即失效且不可恢复，下次调用需要先重新申请。</p>
              </div>
            </div>

            <div v-if="apiKeyData?.api_key_mask" class="rounded-xl border border-[rgba(0,0,0,0.06)] bg-surface-secondary px-4 py-3">
              <div class="mb-1 text-xs text-text-tertiary">当前 Key</div>
              <div class="break-all font-mono text-sm font-medium text-text">{{ apiKeyData.api_key_mask }}</div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 border-t border-[rgba(0,0,0,0.06)] bg-[rgba(245,245,247,0.72)] px-6 py-4">
            <button
              @click="closeDeleteDialog"
              :disabled="deletingKey"
              class="rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2 text-sm font-medium text-text transition-all hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              取消
            </button>
            <button
              @click="confirmDeleteKey"
              :disabled="deletingKey"
              class="rounded-[10px] bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {{ deletingKey ? '删除中...' : '确认删除' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="showChangePasswordDialog"
        class="fixed inset-0 z-[220] flex items-center justify-center bg-[rgba(0,0,0,0.42)] backdrop-blur-[10px] px-5 py-8"
        @click="closeChangePasswordDialog"
      >
        <div
          class="w-full max-w-[420px] overflow-hidden rounded-modal bg-white shadow-modal animate-modal-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-password-title"
          @click.stop
        >
          <div class="px-6 pt-6 pb-5">
            <div class="mb-5 flex items-start gap-4">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-surface-secondary text-text-secondary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div class="min-w-0 flex-1">
                <h3 id="change-password-title" class="text-[18px] font-semibold leading-6 text-text">修改密码</h3>
                <p class="mt-2 text-sm leading-6 text-text-secondary">请设置新的登录密码，至少 6 位。</p>
              </div>
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-text mb-1.5">新密码</label>
                <div class="relative">
                  <input v-model="newPassword" :type="showNewPassword ? 'text' : 'password'" class="w-full rounded-xl border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2.5 text-sm text-text outline-none transition-colors focus:border-text focus:ring-1 focus:ring-text/20" placeholder="至少 6 位" />
                  <button type="button" @click="showNewPassword = !showNewPassword" class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary hover:text-text transition-colors">{{ showNewPassword ? '隐藏' : '显示' }}</button>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-text mb-1.5">确认新密码</label>
                <div class="relative">
                  <input v-model="confirmNewPassword" :type="showConfirmPassword ? 'text' : 'password'" class="w-full rounded-xl border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2.5 text-sm text-text outline-none transition-colors focus:border-text focus:ring-1 focus:ring-text/20" placeholder="请再次输入新密码" />
                  <button type="button" @click="showConfirmPassword = !showConfirmPassword" class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary hover:text-text transition-colors">{{ showConfirmPassword ? '隐藏' : '显示' }}</button>
                </div>
              </div>
              <p v-if="passwordError" class="text-xs text-red-500 mt-1">{{ passwordError }}</p>
            </div>
          </div>
          <div class="flex items-center justify-end gap-3 border-t border-[rgba(0,0,0,0.06)] bg-[rgba(245,245,247,0.72)] px-6 py-4">
            <button @click="closeChangePasswordDialog" :disabled="changingPassword" class="rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2 text-sm font-medium text-text transition-all hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50">取消</button>
            <button @click="submitChangePassword" :disabled="changingPassword" class="rounded-[10px] bg-accent px-4 py-2 text-sm font-medium text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{{ changingPassword ? '修改中...' : '确认修改' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Password Change Success Popup -->
    <Teleport to="body">
      <div v-if="showSuccessDialog" class="fixed inset-0 z-[200] flex items-center justify-center">
        <div class="absolute inset-0 bg-[rgba(0,0,0,0.45)] backdrop-blur-[8px]" @click="closeSuccessDialog"></div>
        <div class="relative bg-white rounded-modal p-10 max-w-[380px] w-full mx-5 shadow-modal text-center animate-modal-in">
          <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-[#e8f5e9] flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <h3 class="text-xl font-bold text-text mb-2">密码修改成功</h3>
          <p class="text-sm text-text-secondary mb-6">请使用新密码重新登录</p>
          <button @click="closeSuccessDialog" class="w-full py-2.5 text-sm font-medium bg-accent text-white rounded-[10px] border-none cursor-pointer transition-colors hover:bg-accent-hover">知道了</button>
        </div>
      </div>
    </Teleport>
    <AppDialog
      :open="dialogOpen"
      :title="dialogTitle"
      :message="dialogMessage"
      :type="dialogType"
      @close="dialogOpen = false"
      @confirm="dialogCallback ? dialogCallback() : null"
    />
  </main>

  <!-- 模型用量浮动 tooltip（Teleport 到 body，脱离文档流，不撑开布局） -->
  <Teleport to="body">
    <div v-if="modelHover"
      class="fixed z-[500] pointer-events-none bg-[#1d1d1f] text-white text-[12px] rounded-lg px-3 py-2 shadow-xl whitespace-nowrap"
      :style="{ left: modelTipX + 'px', top: modelTipY + 'px' }">
      <div class="font-medium max-w-[220px] truncate">{{ modelHover.name }}</div>
      <div class="text-[11px] text-white/70 mt-0.5">总 Token: <span class="font-mono text-white">{{ fmtNum(modelHover.totalTokens) }}</span></div>
      <div class="text-[11px] text-white/70">请求数: <span class="font-mono text-white">{{ modelHover.requestCount }}</span></div>
      <div class="text-[11px] text-white/70">输入: <span class="font-mono text-white">{{ fmtNum(modelHover.promptTokens) }}</span></div>
      <div class="text-[11px] text-white/70">输出: <span class="font-mono text-white">{{ fmtNum(modelHover.completionTokens) }}</span></div>
      <div class="text-[11px] text-white/70">缓存: <span class="font-mono text-white">{{ fmtNum(modelHover.cachedTokens) }}</span></div>
    </div>
  </Teleport>
</div>
</template>
<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import NavBar from '../components/NavBar.vue'
import SkillDetailModal from '../components/SkillDetailModal.vue'
import AppDialog from '../components/AppDialog.vue'
import SkillctlGuide from '../components/SkillctlGuide.vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])
const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))
const router = useRouter()
const route = useRoute()
const activeTab = ref('info')
const user = ref({})
const apiKeyData = ref(null)
const keysLoading = ref(false)
const creatingKey = ref(false)
const resettingKey = ref(false)
const deletingKey = ref(false)
const copied = ref(false)
const mySkills = ref([])
const mySkillsLoading = ref(false)
const showResetDialog = ref(false)
const showDeleteDialog = ref(false)
const selectedSkill = ref(null)
const featureFlags = ref({ skillSubmitEnabled: false, skillctlDocUrl: '' })
const keyError = ref('')
const keyErrorOk = ref(false)
// 调用地址(Base URL):与模型广场同源,来自 model_example_endpoint
// 放在 Key 卡片内,让用户在凭证位置同时拿到 key 和调用地址,免去切换模型广场
const baseUrl = ref('')
const copiedBaseUrl = ref(false)
function showKeyError(msg, ok = false) {
  keyError.value = msg
  keyErrorOk.value = ok
  if (msg) setTimeout(() => { keyError.value = '' }, 4000)
}

// ====== Token 用量统计 ======
const usageData = ref(null)
const usageLoading = ref(false)
const usageError = ref('')
const selectedMonth = ref(new Date().getMonth() + 1)
const selectedYear = ref(new Date().getFullYear())
// 可选的年月列表：往前 12 个月 + 当前月
const monthOptions = computed(() => {
  const opts = []
  const now = new Date()
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    opts.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: `${d.getFullYear()}-${d.getMonth() + 1}月`, value: `${d.getFullYear()}-${d.getMonth() + 1}` })
  }
  return opts
})
const selectedYM = ref(`${selectedYear.value}-${selectedMonth.value}`)
watch(selectedYM, (v) => { const [y, m] = v.split('-').map(Number); selectedYear.value = y; selectedMonth.value = m })
const monthLabel = computed(() => `${selectedYear.value}-${selectedMonth.value}月`)
const fmtNum = (n) => { if (n == null) return '0'; if (n >= 1000000) return (n/1000000).toFixed(1)+'M'; if (n >= 1000) return (n/1000).toFixed(1)+'K'; return String(n) }
const filteredTrends = computed(() => { const t = usageData.value?.trends; if (!t) return []; const ym = `${selectedYear.value}-${String(selectedMonth.value).padStart(2,'0')}`; return t.filter(v => v.name && v.name.startsWith(ym)) })
const tokenChartRef = ref(null)
const reqChartRef = ref(null)
let tokenChart = null
let reqChart = null

function initTokenChart() {
  if (!tokenChartRef.value || !filteredTrends.value.length) return
  if (tokenChart) { tokenChart.dispose(); tokenChart = null }
  tokenChart = echarts.init(tokenChartRef.value)
  const dates = filteredTrends.value.map(t => t.name)
  tokenChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,0.04)' } },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: 'rgba(0,0,0,0.1)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#1D2129', fontSize: 11 },
      formatter: (params) => {
        const d = params[0]?.axisValue || ''
        let html = `<div style="font-weight:600;margin-bottom:4px;color:#1D2129">${d}</div>`
        const map = { cachedTokens: '缓存', promptTokens: '输入', completionTokens: '输出' }
        const colors = { cachedTokens: '#f59e0b', promptTokens: '#005eeb', completionTokens: '#10b981' }
        let total = 0
        params.forEach(p => {
          if (p.seriesName === '总计') return
          const v = p.value || 0
          total += v
          html += `<div style="display:flex;justify-content:space-between;gap:16px;line-height:1.8"><span style="color:${colors[p.seriesName] || '#475569'}">● ${map[p.seriesName] || p.seriesName}</span><span style="color:#1D2129;font-weight:500">${fmtNum(v)}</span></div>`
        })
        html += `<div style="border-top:1px solid rgba(0,0,0,0.08);margin-top:4px;padding-top:4px;font-weight:600;color:#1D2129">总计: ${fmtNum(total)}</div>`
        return html
      }
    },
    legend: {
      data: ['缓存', '输入', '输出'],
      textStyle: { color: '#475569', fontSize: 10 },
      itemWidth: 10, itemHeight: 10, top: 0, right: 0
    },
    grid: { left: 0, right: 0, top: 28, bottom: 0, containLabel: false },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 10, margin: 4 }
    },
    yAxis: {
      type: 'value',
      splitLine: { show: false },
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      { name: '缓存', type: 'bar', stack: 'total', data: filteredTrends.value.map(t => t.cachedTokens || 0), itemStyle: { color: '#f59e0b' }, barMaxWidth: 16 },
      { name: '输入', type: 'bar', stack: 'total', data: filteredTrends.value.map(t => t.promptTokens || 0), itemStyle: { color: '#005eeb' }, barMaxWidth: 16 },
      { name: '输出', type: 'bar', stack: 'total', data: filteredTrends.value.map(t => t.completionTokens || 0), itemStyle: { color: '#10b981' }, barMaxWidth: 16 },
    ]
  })
}

function initReqChart() {
  if (!reqChartRef.value || !filteredTrends.value.length) return
  if (reqChart) { reqChart.dispose(); reqChart = null }
  reqChart = echarts.init(reqChartRef.value)
  const dates = filteredTrends.value.map(t => t.name)
  const values = filteredTrends.value.map(t => t.requestCount || 0)
  reqChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,0.04)' } },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: 'rgba(0,0,0,0.1)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#1D2129', fontSize: 11 },
      formatter: (params) => {
        const d = params[0]?.axisValue || ''
        const v = params[0]?.value || 0
        return `<div style="font-weight:600;margin-bottom:4px;color:#1D2129">${d}</div>
          <div style="display:flex;justify-content:space-between;gap:16px;line-height:1.8"><span style="color:#005eeb">● 请求次数</span><span style="color:#1D2129;font-weight:500">${fmtNum(v)}</span></div>`
      }
    },
    legend: { show: false },
    grid: { left: 0, right: 0, top: 28, bottom: 0, containLabel: false },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 10, margin: 4 }
    },
    yAxis: {
      type: 'value',
      splitLine: { show: false },
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [{
      name: '请求次数',
      type: 'bar',
      data: values,
      itemStyle: { color: '#005eeb', borderRadius: [2, 2, 0, 0] },
      barMaxWidth: 16
    }]
  })
}

watch([filteredTrends, selectedYM], () => {
  nextTick(() => {
    initTokenChart()
    initReqChart()
  })
})

// 窗口尺寸变化时重绘图表
const onResize = () => {
  tokenChart?.resize()
  reqChart?.resize()
}
onMounted(() => {
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  if (tokenChart) { tokenChart.dispose(); tokenChart = null }
  if (reqChart) { reqChart.dispose(); reqChart = null }
})

// 模型用量横向柱状图
const modelHover = ref(null)
const modelTipX = ref(0)
const modelTipY = ref(0)
const onModelEnter = (e, m) => { modelHover.value = m; modelTipX.value = e.clientX + 12; modelTipY.value = e.clientY + 12 }
const onModelMove = (e) => { modelTipX.value = e.clientX + 12; modelTipY.value = e.clientY + 12 }
const onModelLeave = () => { modelHover.value = null }
const sortedModels = computed(() => {
  const arr = usageData.value?.models ? [...usageData.value.models] : []
  return arr.sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0))
})
const modelPct = (m) => {
  const max = Math.max(...(usageData.value?.models || []).map(v => v.totalTokens || 0), 1)
  return Math.min((m.totalTokens || 0) / max * 100, 100)
}
const fetchUsage = async () => { if (!apiKeyData.value) return; usageLoading.value = true; usageError.value = ''; try { const t = localStorage.getItem('token'); const r = await fetch(`${API_BASE}/usage/statistics`,{headers:{Authorization:`Bearer ${t}`}}); const j = await r.json(); usageData.value = j.data || null } catch { usageError.value = '加载失败'; usageData.value = null } finally { usageLoading.value = false } }

// 根据角色动态生成标签页
const tabs = computed(() => {
  const tabsList = [
    { id: 'info', label: '基础信息' },
    { id: 'keys', label: 'API Key 管理' },
  ]

  // 管理员看到"技能审核"，普通用户看到"我的技能"
  tabsList.push({
    id: 'skills',
    label: isAdmin.value ? '技能审核' : '我的技能',
  })

  return tabsList
})
const showChangePasswordDialog = ref(false)
const showSuccessDialog = ref(false)
const newPassword = ref('')
const confirmNewPassword = ref('')
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
const changingPassword = ref(false)
const passwordError = ref('')
const isAdmin = computed(() => user.value.role === 'admin')
const fetchUser = async () => {
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) user.value = await res.json()
  } catch (e) { console.error(e) }
}
const fetchKeys = async () => {
  keysLoading.value = true
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/keys`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const data = await res.json()
      apiKeyData.value = data.key || null
      if (apiKeyData.value) fetchUsage()
    }
  } catch (e) { console.error(e) } finally { keysLoading.value = false }
}
// Base URL 是全局共享的调用地址(管理员在系统配置里维护),与具体 key 无关
// 复用公开接口 /api/models/example,失败时保持空串 → 模板里走"未配置"提示
const fetchBaseUrl = async () => {
  try {
    const res = await fetch(`${API_BASE}/models/example`)
    if (res.ok) {
      const data = await res.json()
      baseUrl.value = data.endpoint || ''
    }
  } catch (e) { console.error('Failed to fetch base url:', e) }
}
const copyBaseUrl = async () => {
  const url = baseUrl.value
  if (!url) return
  const ok = await writeClipboard(url)
  if (!ok) {
    window.prompt('自动复制失败，请手动复制以下地址：', url)
    return
  }
  copiedBaseUrl.value = true
  setTimeout(() => { copiedBaseUrl.value = false }, 2000)
}
const fetchMySkills = async () => {
  mySkillsLoading.value = true
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/my/skills`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); mySkills.value = d.data || d }
  } catch (e) { console.error(e) } finally { mySkillsLoading.value = false }
}
const toDetailSkill = (skill) => ({
  id: skill.skill_id,
  title: skill.title,
  slug: skill.slug || skill.skill_id,
  description: skill.description || '',
  category: skill.category,
  author: skill.author || skill.submitted_by || user.value.name || user.value.username,
  version: skill.version || 'v1.0.0',
  downloads: skill.downloads || 0,
  avatar: (skill.title || skill.skill_id || 'S').slice(0, 1).toUpperCase(),
  avatarColor: 'av-blue',
  installUrl: skill.status === 'approved' ? `/api/skills/${skill.slug || skill.skill_id}/download` : '',
})
const openSkillDetail = (skill) => {
  selectedSkill.value = toDetailSkill(skill)
}
const createKey = async () => {
  creatingKey.value = true
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/keys`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
    if (res.ok) {
      const data = await res.json()
      apiKeyData.value = data.key || null
    } else {
      const err = await res.json().catch(() => ({}))
      showKeyError(err.error || '创建失败')
    }
  } catch (e) { console.error(e) } finally { creatingKey.value = false }
}
const openResetDialog = () => {
  showResetDialog.value = true
}
const closeResetDialog = () => {
  if (resettingKey.value) return
  showResetDialog.value = false
}
const confirmResetKey = async () => {
  resettingKey.value = true
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/keys/reset`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
    if (res.ok) {
      const data = await res.json()
      apiKeyData.value = data.key || null
      showResetDialog.value = false
    } else {
      const err = await res.json().catch(() => ({}))
      showKeyError(err.error || '重置失败')
    }
  } catch (e) { console.error(e) } finally { resettingKey.value = false }
}
const openDeleteDialog = () => {
  showDeleteDialog.value = true
}
const closeDeleteDialog = () => {
  if (deletingKey.value) return
  showDeleteDialog.value = false
}
const confirmDeleteKey = async () => {
  deletingKey.value = true
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/keys`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      apiKeyData.value = null
      showDeleteDialog.value = false
    } else {
      const err = await res.json().catch(() => ({}))
      // 与后端错误码对齐:PANEL_UNREACHABLE / PANEL_REJECTED 都不动本地,允许用户重试
      showKeyError(err.error || '删除失败')
    }
  } catch (e) { console.error(e) } finally { deletingKey.value = false }
}
// 兜底剪贴板：HTTP / 旧浏览器 / 非 secure context 下 navigator.clipboard 不可用
const writeClipboard = async (text) => {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (e) { /* 权限被拒，落到 fallback */ }
  }
  // execCommand fallback——HTTP 环境下唯一可行的方案
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

const copyFullKey = async () => {
  if (!apiKeyData.value) return
  let key = apiKeyData.value.api_key || ''
  // mask 形态（带 **** 或长度过短）一律视为「需要二次拉取明文」
  const isMask = !key || key.includes('*') || key.length < 20
  if (isMask) {
    try {
      const token = localStorage.getItem('token')
      const idForReveal = apiKeyData.value.id || apiKeyData.value.panel_key_id
      const res = await fetch(`${API_BASE}/keys/${idForReveal}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        key = data.api_key || ''
      } else if (res.status === 409 && data.code === 'REVEAL_FAILED') {
        // 后端明确告知：拿不到明文，引导重置
        showKeyError(data.error || '无法获取完整 API Key，请点击「重置 Key」重新生成')
        return
      } else {
        showKeyError(data.error || `获取 API Key 失败 (HTTP ${res.status})`)
        return
      }
    } catch (e) {
      console.error('reveal API Key 失败:', e)
      showKeyError('网络异常，无法获取完整 API Key')
      return
    }
  }
  if (!key || key.includes('*')) {
    showKeyError('未取到完整 API Key，请点击「重置 Key」重新生成')
    return
  }
  const ok = await writeClipboard(key)
  if (!ok) {
    // 最后一道兜底：把 key 显示出来让用户手动复制
    window.prompt('自动复制失败，请手动复制以下 API Key：', key)
    return
  }
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
// 账号绑定 / 设置密码（自动创建用户首次设置）
const allProviders = ref([])
const myIdentities = ref([])
const hasPassword = ref(true)
const autoCreatedFrom = ref(null)
const showWelcomeBanner = ref(false)

// 统一弹窗
const dialogOpen = ref(false)
const dialogTitle = ref('')
const dialogMessage = ref('')
const dialogType = ref('info')   // info | confirm
let dialogCallback = null

function showDialog(msg, opts = {}) {
  dialogTitle.value = opts.title || ''
  dialogMessage.value = msg
  dialogType.value = opts.type || 'info'
  dialogCallback = opts.onConfirm || null
  dialogOpen.value = true
}

function showToast(msg) {
  showDialog(msg, { title: '提示', type: 'info' })
}
const setPwdNew = ref('')
const setPwdConfirm = ref('')
const settingPassword = ref(false)
const setPasswordError = ref('')
const setPasswordSuccess = ref(false)
const authHeader = () => {
  const t = localStorage.getItem('token') || localStorage.getItem('admin_token')
  return { Authorization: `Bearer ${t}` }
}
const findBoundIdentity = (provider) => myIdentities.value.find((i) => i.provider === provider)
const loadFeatureFlags = async () => {
  try {
    const res = await fetch(`${API_BASE}/config/feature-flags`)
    if (res.ok) featureFlags.value = await res.json()
  } catch (e) { console.warn('loadFeatureFlags failed:', e) }
}
const loadOauthState = async () => {
  try {
    const [pr, idr] = await Promise.all([
      fetch(`${API_BASE}/auth/oauth/providers`).then((r) => r.json()),
      fetch(`${API_BASE}/auth/identities`, { headers: authHeader() }).then((r) => r.json()),
    ])
    allProviders.value = pr.providers || []
    myIdentities.value = idr.identities || []
  } catch (e) { console.warn('loadOauthState failed:', e) }
  try {
    const r = await fetch(`${API_BASE}/auth/me`, { headers: authHeader() })
    if (r.ok) {
      const data = await r.json()
      hasPassword.value = !!data.has_password
      autoCreatedFrom.value = data.auto_created_from || null
    }
  } catch {}
}
const startBindProvider = async (provider) => {
  if (provider !== 'wecom') return
  try {
    const res = await fetch(`${API_BASE}/auth/oauth/wecom/url?intent=bind&return=/profile`, { headers: authHeader() })
    const data = await res.json()
    if (!res.ok) { showToast(data.error || '发起绑定失败'); return }
    if (data.url) { window.location.href = data.url; return }
    showToast('未拿到企业微信登录地址')
  } catch (e) { showToast(e.message || '发起绑定失败') }
}
const unbindProvider = async (provider) => {
  const label = allProviders.value.find((p) => p.provider === provider)?.display_name || provider
  showDialog(`确定要解除「${label}」的绑定吗？`, {
    title: '解绑确认',
    type: 'confirm',
    onConfirm: async () => {
      dialogOpen.value = false
      try {
        const res = await fetch(`${API_BASE}/auth/identities/${provider}`, { method: 'DELETE', headers: authHeader() })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (data.code === 'OAUTH_UNBIND_LAST_IDENTITY') {
            showToast('解绑此身份后您将无法登录,请先在下方设置一个登录密码后再解绑。')
          } else {
            showToast(data.error || '解绑失败')
          }
          return
        }
        await loadOauthState()
      } catch (e) { showToast(e.message || '解绑失败') }
    },
  })
}
const setPasswordForAutoUser = async () => {
  setPasswordError.value = ''
  if (!setPwdNew.value || setPwdNew.value.length < 6) { setPasswordError.value = '密码至少 6 位'; return }
  if (setPwdNew.value !== setPwdConfirm.value) { setPasswordError.value = '两次密码不一致'; return }
  settingPassword.value = true
  try {
    const res = await fetch(`${API_BASE}/auth/password/set`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: setPwdNew.value }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setPasswordError.value = data.error || '设置失败'; return }
    setPasswordSuccess.value = true
    hasPassword.value = true
    autoCreatedFrom.value = null
    setPwdNew.value = ''
    setPwdConfirm.value = ''
  } catch (e) {
    setPasswordError.value = e.message || '网络错误'
  } finally {
    settingPassword.value = false
  }
}
const formatDate = (d) => { if (!d) return '-'; return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.push('/login') }
const goToAdmin = () => { router.push('/admin') }
const openChangePasswordDialog = () => {
  passwordError.value = ''
  newPassword.value = ''
  confirmNewPassword.value = ''
  showNewPassword.value = false
  showConfirmPassword.value = false
  showChangePasswordDialog.value = true
}
const closeChangePasswordDialog = () => {
  if (changingPassword.value) return
  showChangePasswordDialog.value = false
}
const closeSuccessDialog = () => {
  showSuccessDialog.value = false
  // 清除登录状态并跳转到登录页
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/login')
}
const submitChangePassword = async () => {
  passwordError.value = ''
  if (!newPassword.value || !confirmNewPassword.value) {
    passwordError.value = '请填写完整密码信息'
    return
  }
  if (newPassword.value.length < 6) {
    passwordError.value = '新密码至少 6 位'
    return
  }
  if (newPassword.value !== confirmNewPassword.value) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }
  changingPassword.value = true
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/auth/password`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword.value }),
    })
    if (res.ok) {
      showChangePasswordDialog.value = false
      showSuccessDialog.value = true
    } else {
      const err = await res.json().catch(() => ({}))
      passwordError.value = err.error || '修改失败'
    }
  } catch (e) {
    console.error(e)
    passwordError.value = '网络错误'
  } finally {
    changingPassword.value = false
  }
}
// Support tab deep links
watch(() => route.query.tab, (t) => {
  if (t === 'api-keys') activeTab.value = 'keys'
  if (t === 'skills') activeTab.value = 'skills'
}, { immediate: true })
onMounted(() => {
  fetchUser()
  if (activeTab.value === 'keys') { fetchKeys(); fetchBaseUrl() }
  if (activeTab.value === 'skills') fetchMySkills()
  loadOauthState()
  loadFeatureFlags()
  if (route.query.bound === '1') {
    setTimeout(() => showToast('已绑定企业微信'), 100)
  }
  if (route.query.welcome === '1') {
    showWelcomeBanner.value = true
  }
})
// 切到 keys tab：已有数据就不重复拉（避免每次切换都打 1Panel 慢），
// 用户可点刷新按钮主动更新
const refreshKeys = () => { fetchKeys(); fetchBaseUrl() }
watch(activeTab, (v) => {
  if (v === 'keys') {
    if (!apiKeyData.value && !keysLoading.value) { fetchKeys(); fetchBaseUrl() }
    if (apiKeyData.value && !usageData.value) fetchUsage()
  }
  if (v === 'skills') fetchMySkills()
})
</script>
