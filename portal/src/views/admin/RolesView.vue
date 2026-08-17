<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">角色权限</h1>
        <p class="text-text-secondary text-sm mt-1">角色管「能做什么操作」，与资源组（看到什么资源）不耦合。权限粒度 = 模块 × CRUD</p>
      </div>
    </div>

    <div class="flex gap-6 items-start">
      <!-- 左栏：角色列表 -->
      <div class="w-[340px] shrink-0">
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-card overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,0,0,0.06)]">
            <span class="text-sm font-semibold text-text">角色列表</span>
            <button v-if="can('role:create')" @click="startNewRole" class="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover font-medium">
              <Plus class="w-3.5 h-3.5" />新建角色
            </button>
          </div>

          <div v-if="loading && !roles.length" class="py-14 text-center text-sm text-text-secondary">加载中...</div>

          <div v-else class="py-2">
            <!-- 内置角色 -->
            <div v-if="builtInRoles.length" class="mb-1">
              <div class="px-4 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">内置角色</div>
              <div
                v-for="r in builtInRoles" :key="r.id"
                class="flex items-center gap-2 px-4 py-2.5 mx-2 rounded-lg cursor-pointer transition-all"
                :class="selectedRole?.id === r.id ? 'bg-accent/5 text-accent border-l-[3px] border-accent rounded-l-none' : 'hover:bg-black/[0.02] text-text'"
                @click="selectRole(r)"
              >
                <span class="text-sm font-medium truncate flex-1">{{ r.name === 'admin' ? '超级管理员' : r.name === 'user' ? '普通用户' : r.name }}</span>
                <span class="shrink-0 px-2 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-600">内置</span>
              </div>
            </div>

            <!-- 分割线 -->
            <div v-if="customRoles.length" class="border-t border-[rgba(0,0,0,0.06)] my-2"></div>

            <!-- 自定义角色 -->
            <div v-if="customRoles.length">
              <div class="px-4 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">自定义角色</div>
              <div
                v-for="r in customRoles" :key="r.id"
                class="flex items-center gap-2 px-4 py-2.5 mx-2 rounded-lg cursor-pointer transition-all group"
                :class="selectedRole?.id === r.id ? 'bg-accent/5 text-accent border-l-[3px] border-accent rounded-l-none' : 'hover:bg-black/[0.02] text-text'"
                @click="selectRole(r)"
              >
                <span class="text-sm font-medium truncate flex-1">{{ r.name }}</span>
                <span class="text-xs text-text-tertiary shrink-0">{{ r.user_count }} 用户</span>
                <button
                  v-if="can('role:delete')"
                  class="shrink-0 p-1 text-text-tertiary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  title="删除"
                  @click.stop="confirmDelete(r)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div v-if="!roles.length" class="py-8 text-center text-sm text-text-tertiary">暂无角色</div>
          </div>
        </div>
      </div>

      <!-- 右栏：权限编辑区 -->
      <div class="flex-1 min-w-0">
        <!-- 未选中任何角色且不是在新建 -->
        <div v-if="!selectedRole && !isCreating" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-card p-12 text-center">
          <div class="text-text-tertiary text-sm">请从左侧选择一个角色</div>
        </div>

        <!-- 新建角色 -->
        <div v-else-if="isCreating" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-card p-6">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold text-text">新建角色</h2>
            <div class="flex items-center gap-2">
              <span v-if="isAdminRole" class="px-2.5 py-1 rounded-full text-xs bg-indigo-50 text-indigo-600">后台角色</span>
              <span v-else class="px-2.5 py-1 rounded-full text-xs bg-emerald-50 text-emerald-600">用户侧角色</span>
              <button @click="cancelNewRole" class="text-sm text-text-tertiary hover:text-text transition-colors">取消</button>
            </div>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-text mb-1.5">角色名 <span class="text-red-500">*</span></label>
                <input
                  v-model="formName"
                  class="w-full h-10 px-3 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary"
                  placeholder="角色名称"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-text mb-1.5">继承自</label>
                <div class="flex items-center gap-2">
                  <select
                    v-model="inheritFrom"
                    class="w-full h-10 px-3 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary cursor-pointer"
                    @change="applyInherit"
                  >
                    <option value="custom">自定义（从零开始）</option>
                    <option value="admin">管理员（后台角色）</option>
                    <option value="user">普通用户（用户侧角色）</option>
                  </select>
                  <span v-if="inheritFrom === 'admin'" class="shrink-0 px-2.5 py-1 rounded-full text-xs bg-indigo-50 text-indigo-600">继承自管理员</span>
                  <span v-else-if="inheritFrom === 'user'" class="shrink-0 px-2.5 py-1 rounded-full text-xs bg-emerald-50 text-emerald-600">继承自普通用户</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 权限设置：菜单权限 + 操作权限 两区块平铺 -->
          <div class="mt-6 space-y-5">
            <!-- 菜单权限 -->
            <div>
              <div class="text-sm font-medium text-text mb-2">菜单权限</div>
              <div class="space-y-3">
                <div v-for="group in visibleMenuGroups" :key="group.id" class="border border-[rgba(0,0,0,0.06)] rounded-lg p-3">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-semibold text-text-secondary">{{ group.label }}</span>
                    <span class="text-[11px] text-text-tertiary">{{ group.permissions.length }} 项</span>
                    <div class="flex-1"></div>
                    <div
                      class="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs cursor-pointer select-none transition-all border"
                      :class="groupAllSelected(group) ? 'bg-accent text-white border-accent' : groupSomeSelected(group) ? 'bg-accent/10 text-accent border-accent/30' : 'bg-white border-[rgba(0,0,0,0.06)] text-text-secondary hover:border-text'"
                      @click="toggleGroupAll(group)"
                    >
                      全选
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <div
                      v-for="m in group.permissions" :key="m.key"
                      class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs cursor-pointer select-none transition-all"
                      :class="selectedPerms.has(m.key) ? 'bg-accent text-white border border-transparent' : 'bg-white border border-[rgba(0,0,0,0.06)] text-text-secondary hover:border-text'"
                      @click="togglePerm(m.key)"
                    >
                      {{ m.name }}
                    </div>
                    <div v-if="!group.permissions.length" class="text-xs text-text-tertiary">暂无菜单</div>
                  </div>
                </div>
                <div v-if="!visibleMenuGroups.length" class="text-xs text-text-tertiary">暂无菜单</div>
              </div>
            </div>

            <!-- 按钮权限（按页面归组，每行首位为该行全选；查看类权限隐式默认随菜单授予） -->
            <div>
              <div class="text-sm font-medium text-text mb-2">按钮权限<span v-if="!permReadonly" class="ml-2 text-xs font-normal text-text-tertiary">页面内的操作按钮，随菜单联动勾选；查看、同步、配置等共享权限随对应菜单默认授予，不逐页重复展示</span></div>
              <div v-if="buttonGroups.length" class="space-y-3">
                <div v-for="row in buttonGroups" :key="row.menuKey" class="flex flex-wrap items-center gap-2">
                  <div
                    class="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs cursor-pointer select-none transition-all border"
                    :class="permReadonly ? 'opacity-50 cursor-not-allowed' : rowAllSelected(row) ? 'bg-accent text-white border-accent' : rowSomeSelected(row) ? 'bg-accent/10 text-accent border-accent/30' : 'bg-white border-[rgba(0,0,0,0.06)] text-text-secondary hover:border-text'"
                    @click="!permReadonly && toggleRowAll(row)"
                  >
                    全选
                  </div>
                  <span class="w-24 shrink-0 text-xs font-semibold text-text-secondary">{{ row.menuName }}</span>
                  <div
                    v-for="btn in row.buttons" :key="btn.key"
                    class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs cursor-pointer select-none transition-all"
                    :class="selectedPerms.has(btn.key) || showAllPerms ? 'bg-accent text-white border border-transparent' : 'bg-white border border-[rgba(0,0,0,0.06)] text-text-secondary hover:border-text'"
                    :style="permReadonly ? 'opacity: 0.5; pointer-events: none;' : ''"
                    :title="!permReadonly && selectedPerms.has(btn.key) && isImplicitRequired(btn.key) ? lockedHint(btn.key) : ''"
                    @click="!permReadonly && togglePerm(btn.key)"
                  >
                    {{ btn.label }}
                    <Lock v-if="!permReadonly && selectedPerms.has(btn.key) && isImplicitRequired(btn.key)" class="w-3 h-3 opacity-70" />
                  </div>
                </div>
              </div>
              <div v-else class="text-xs text-text-tertiary">请先勾选上方菜单，这里会显示对应页面下的按钮权限</div>
            </div>
          </div>

          <div class="flex justify-end mt-6">
            <button
              v-if="can('role:create')"
              @click="saveNewRole"
              :disabled="saving || !formName.trim()"
              class="px-6 py-2.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-all"
            >
              {{ saving ? '创建中...' : '创建角色' }}
            </button>
          </div>
        </div>

        <!-- 编辑角色 -->
        <div v-else-if="selectedRole" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-card p-6">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold text-text">{{ displayName(selectedRole) }}</h2>
            <div class="flex items-center gap-2">
              <span v-if="isAdminRole" class="px-2.5 py-1 rounded-full text-xs bg-indigo-50 text-indigo-600">后台角色</span>
              <span v-else class="px-2.5 py-1 rounded-full text-xs bg-emerald-50 text-emerald-600">用户侧角色</span>
              <template v-if="!selectedRole.is_system">
                <span v-if="selectedRole.inherit_from === 'admin'" class="px-2.5 py-1 rounded-full text-xs bg-indigo-50/50 text-indigo-500">继承自管理员</span>
                <span v-else-if="selectedRole.inherit_from === 'user'" class="px-2.5 py-1 rounded-full text-xs bg-emerald-50/50 text-emerald-600">继承自普通用户</span>
                <span v-else-if="selectedRole.inherit_from === 'custom'" class="px-2.5 py-1 rounded-full text-xs bg-gray-50 text-text-tertiary">继承自自定义</span>
              </template>
              <span v-if="selectedRole.is_system" class="px-2.5 py-1 rounded-full text-xs bg-amber-50 text-amber-600">内置角色</span>
            </div>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-text mb-1.5">角色名</label>
              <input
                :value="selectedRole.name"
                disabled
                class="w-full h-10 px-3 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none bg-surface-secondary text-text-secondary cursor-not-allowed"
              />
              <template v-if="!selectedRole.is_system">
              <p v-if="selectedRole.inherit_from === 'admin'" class="mt-1.5 text-xs text-indigo-500">继承自：管理员（后台角色）</p>
              <p v-else-if="selectedRole.inherit_from === 'user'" class="mt-1.5 text-xs text-emerald-600">继承自：普通用户（用户侧角色）</p>
              <p v-else-if="selectedRole.inherit_from === 'custom'" class="mt-1.5 text-xs text-text-tertiary">继承自：自定义（从零开始）</p>
            </template>
            </div>
          </div>

          <!-- 权限设置：菜单权限 + 操作权限 两区块平铺 -->
          <div class="mt-6 space-y-5">
            <div class="flex items-center justify-between mb-1">
              <label class="text-sm font-medium text-text">权限设置</label>
              <span v-if="selectedRole.is_system" class="text-xs text-amber-600">内置角色权限集不可修改</span>
            </div>

            <!-- 菜单权限（按分类分组:后台菜单/用户侧菜单,各自全选） -->
            <div>
              <div class="text-sm font-medium text-text mb-2">菜单权限</div>
              <div class="space-y-3">
                <div v-for="group in visibleMenuGroups" :key="group.id" class="border border-[rgba(0,0,0,0.06)] rounded-lg p-3">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-semibold text-text-secondary">{{ group.label }}</span>
                    <span class="text-[11px] text-text-tertiary">{{ group.permissions.length }} 项</span>
                    <div class="flex-1"></div>
                    <div
                      class="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs cursor-pointer select-none transition-all border"
                      :class="permReadonly ? 'opacity-50 cursor-not-allowed' : groupAllSelected(group) ? 'bg-accent text-white border-accent' : groupSomeSelected(group) ? 'bg-accent/10 text-accent border-accent/30' : 'bg-white border-[rgba(0,0,0,0.06)] text-text-secondary hover:border-text'"
                      @click="!permReadonly && toggleGroupAll(group)"
                    >
                      全选
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <div
                      v-for="m in group.permissions" :key="m.key"
                      class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs cursor-pointer select-none transition-all"
                      :class="selectedPerms.has(m.key) || showAllPerms ? 'bg-accent text-white border border-transparent' : 'bg-white border border-[rgba(0,0,0,0.06)] text-text-secondary hover:border-text'"
                      :style="permReadonly ? 'opacity: 0.5; pointer-events: none;' : ''"
                      @click="!permReadonly && togglePerm(m.key)"
                    >
                      {{ m.name }}
                    </div>
                    <div v-if="!group.permissions.length" class="text-xs text-text-tertiary">暂无菜单</div>
                  </div>
                </div>
                <div v-if="!visibleMenuGroups.length" class="text-xs text-text-tertiary">暂无菜单</div>
              </div>
            </div>

            <!-- 按钮权限（按页面归组，每行首位为该行全选；查看类权限隐式默认随菜单授予） -->
            <div>
              <div class="text-sm font-medium text-text mb-2">按钮权限<span v-if="!permReadonly" class="ml-2 text-xs font-normal text-text-tertiary">页面内的操作按钮，随菜单联动勾选；查看、同步、配置等共享权限随对应菜单默认授予，不逐页重复展示</span></div>
              <div v-if="buttonGroups.length" class="space-y-3">
                <div v-for="row in buttonGroups" :key="row.menuKey" class="flex flex-wrap items-center gap-2">
                  <div
                    class="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs cursor-pointer select-none transition-all border"
                    :class="permReadonly ? 'opacity-50 cursor-not-allowed' : rowAllSelected(row) ? 'bg-accent text-white border-accent' : rowSomeSelected(row) ? 'bg-accent/10 text-accent border-accent/30' : 'bg-white border-[rgba(0,0,0,0.06)] text-text-secondary hover:border-text'"
                    @click="!permReadonly && toggleRowAll(row)"
                  >
                    全选
                  </div>
                  <span class="w-24 shrink-0 text-xs font-semibold text-text-secondary">{{ row.menuName }}</span>
                  <div
                    v-for="btn in row.buttons" :key="btn.key"
                    class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs cursor-pointer select-none transition-all"
                    :class="selectedPerms.has(btn.key) || showAllPerms ? 'bg-accent text-white border border-transparent' : 'bg-white border border-[rgba(0,0,0,0.06)] text-text-secondary hover:border-text'"
                    :style="permReadonly ? 'opacity: 0.5; pointer-events: none;' : ''"
                    :title="!permReadonly && selectedPerms.has(btn.key) && isImplicitRequired(btn.key) ? lockedHint(btn.key) : ''"
                    @click="!permReadonly && togglePerm(btn.key)"
                  >
                    {{ btn.label }}
                    <Lock v-if="!permReadonly && selectedPerms.has(btn.key) && isImplicitRequired(btn.key)" class="w-3 h-3 opacity-70" />
                  </div>
                </div>
              </div>
              <div v-else class="text-xs text-text-tertiary">请先勾选上方菜单，这里会显示对应页面下的按钮权限</div>
            </div>
          </div>

          <div class="flex justify-end mt-6">
            <button
              v-if="can('role:edit')"
              @click="saveEditRole"
              :disabled="saving || selectedRole.name === 'admin'"
              class="px-6 py-2.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-all"
            >
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除确认弹框 -->
    <AppDialog
      :open="!!deletingRole"
      :title="'确认删除角色'"
      :message="`确定删除角色「${deletingRole?.name || ''}」吗？该角色被用户引用时将无法删除，请先移除相关角色关联。`"
      type="confirm"
      confirmText="确认删除"
      @close="deletingRole = null"
      @confirm="doDelete"
    />

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Plus, Trash2, Lock } from 'lucide-vue-next'
import { API_BASE, getLoginToken, errMsg } from '../../lib/apiBase'
import AppDialog from '../../components/AppDialog.vue'
import { loadPermissions, can } from '../../composables/usePermissions.js'
import { showToast } from '../../composables/useToast.js'

const router = useRouter()
const route = useRoute()
const getToken = () => getLoginToken()

const roles = ref([])
const allPermissions = ref([])  // { id, module, action, key, name }
const loading = ref(false)
const selectedRole = ref(null)
const isCreating = ref(false)
const formName = ref('')
const formDesc = ref('')
const selectedPerms = ref(new Set())
const inheritFrom = ref('custom')
const saving = ref(false)
const deletingRole = ref(null)
const deleting = ref(false)

// 角色分组
const builtInRoles = computed(() => roles.value.filter(r => r.is_system))
const customRoles = computed(() => roles.value.filter(r => !r.is_system))

// 角色类型判定:有 menu:admin-* 权限或 name==='admin'→后台角色,否则用户侧角色
const isAdminRole = computed(() => {
  if (isCreating.value) return inheritFrom.value === 'admin'
  if (!selectedRole.value) return false
  if (selectedRole.value.name === 'admin') return true
  return (selectedRole.value.permissions || []).some(k => k.startsWith('menu:admin-'))
})

// 后台/用户侧操作权限 key 清单
// 后台操作权限 key 清单（不含 model:sync/mcp:sync:它们是旧版按资源同步的孤儿权限,无 chip/无菜单隐式引用,前端也不调用对应端点,继承授予只会产生无法在 UI 移除的隐形权限）
const ADMIN_OP_KEYS = new Set([
  'model:view', 'skill:view', 'skill:edit', 'skill:publish', 'skill:delete', 'skill:review', 'mcp:view',
  'user:view', 'user:create', 'user:edit', 'user:password', 'user:batch-password', 'user:assign', 'user:delete',
  'role:view', 'role:create', 'role:edit', 'role:delete',
  'group:view', 'group:create', 'group:edit', 'group:delete', 'group:assign', 'group:panel-sync',
  'system:config',
])
const PORTAL_OP_KEYS = new Set([
  'model:view', 'key:view', 'key:create', 'key:edit', 'key:delete',
  'skill:view', 'skill:create', 'mcp:view',
])

// 菜单→该页面的权限映射，分两层：
//   buttons  = 页面内的「操作按钮」权限（新增/编辑/删除/保存/审核/同步/授权成员/配置…），在按钮区展示、可单独勾选
//   implicit = 进页面就该有的「查看类/辅助」权限（model:view/user:view…），不展示，勾菜单即默认授予
// key 是后端 requirePermission 校验的权限位，label 是按钮在页面上的功能名（对齐 docs/rbac-permissions-checklist.md）。
// 菜单→该页面的权限映射，分两层。去重原则：每个权限位只在唯一一处展示/控制，避免勾选时联动其它页面。
//   buttons  = 页面内的「操作按钮」，chip 展示、可单独勾选。共享权限只放主页面，不在每页重复展示。
//   implicit = 进页面就「必需」的权限（页面数据加载/功能依赖），勾菜单即默认带上、不展示、不可单独取消。
// 关键：system:config 是「配置+全量同步」的单一后端权限（17 个路由共用 panel-config/sync-now/oauth）。
//       模型/技能/MCP 页的「同步」按钮本质都是它，若按页各摆一个 chip，勾一个会联动全部——故只作隐式授予，不设独立按钮。
const MENU_TO_BUTTONS = {
  'menu:admin-stats': { buttons: [], implicit: ['user:view'] },
  'menu:admin-review': { buttons: [], implicit: ['user:view', 'skill:review'] },
  'menu:admin-models': { buttons: [], implicit: ['model:view'] },
  'menu:admin-skills': { buttons: [{ key: 'skill:edit', label: '编辑' }, { key: 'skill:publish', label: '上架/下架' }, { key: 'skill:delete', label: '删除' }], implicit: ['skill:view'] },
  'menu:admin-mcps': { buttons: [], implicit: ['mcp:view'] },
  'menu:admin-groups': { buttons: [{ key: 'group:create', label: '新建' }, { key: 'group:edit', label: '编辑' }, { key: 'group:delete', label: '删除' }], implicit: ['group:view'] },
  'menu:admin-assignments': { buttons: [{ key: 'group:assign', label: '授权成员' }], implicit: ['group:view', 'user:view'] },
  'menu:admin-users': { buttons: [{ key: 'user:create', label: '新建' }, { key: 'user:edit', label: '同步用户' }, { key: 'user:password', label: '修改密码' }, { key: 'user:batch-password', label: '批量改密' }, { key: 'user:assign', label: '分配角色' }, { key: 'user:delete', label: '删除' }], implicit: ['user:view'] },
  'menu:admin-roles': { buttons: [{ key: 'role:create', label: '新建' }, { key: 'role:edit', label: '编辑' }, { key: 'role:delete', label: '删除' }], implicit: ['role:view'] },
  'menu:admin-config': { buttons: [], implicit: ['system:config'] },
  'menu:admin-oauth': { buttons: [], implicit: ['system:config'] },
  'menu:admin-panel': { buttons: [{ key: 'group:panel-sync', label: '同步' }], implicit: ['group:view'] },
  'menu:models': { buttons: [], implicit: ['model:view'] },
  'menu:skills': { buttons: [], implicit: ['skill:view'] },
  'menu:mcp': { buttons: [], implicit: ['mcp:view'] },
  'menu:docs': { buttons: [], implicit: [] },
  'menu:api-keys': { buttons: [{ key: 'key:create', label: '新建' }, { key: 'key:edit', label: '重置' }, { key: 'key:delete', label: '删除' }], implicit: ['key:view'] },
  'menu:my-skills': { buttons: [{ key: 'skill:create', label: '提交' }], implicit: [] },
  'menu:submit': { buttons: [{ key: 'skill:create', label: '提交' }], implicit: [] },
}

// 菜单→该菜单关联的全部权限 key（显示按钮 + 隐式默认），供菜单勾选时联动授予
const MENU_TO_OPS = Object.fromEntries(
  Object.entries(MENU_TO_BUTTONS).map(([menu, cfg]) => [menu, [...cfg.buttons.map(b => b.key), ...cfg.implicit]])
)

// 菜单展示顺序
const MENU_ORDER = [
  'menu:admin-stats', 'menu:admin-review',
  'menu:admin-models', 'menu:admin-skills', 'menu:admin-mcps',
  'menu:admin-groups', 'menu:admin-assignments',
  'menu:admin-users', 'menu:admin-roles',
  'menu:admin-config', 'menu:admin-oauth', 'menu:admin-panel',
  'menu:models', 'menu:skills', 'menu:mcp', 'menu:docs',
  'menu:api-keys', 'menu:my-skills', 'menu:submit',
]

// 菜单权限分组（按后台/用户侧两组）,menu:profile 为基础信息默认权限、menu:submit 归入"我的技能"不纳独立菜单
// 每组内按 MENU_ORDER 逻辑顺序排列,保证展示不乱(概览→内容→资源→授权→用户→系统;用户侧模型→技能→MCP→文档→Key→我的技能)
const menuPermissionGroups = computed(() => {
  const backend = { id: 'admin', label: '后台菜单', permissions: [] }
  const portal = { id: 'portal', label: '用户侧菜单', permissions: [] }
  for (const p of allPermissions.value) {
    if (p.module !== 'menu') continue
    if (p.key === 'menu:profile') continue
    // 提交技能不是独立菜单,入口在「我的技能」页内(menu:my-skills 已关联 skill:create),不单独展示
    if (p.key === 'menu:submit') continue
    if (p.action.startsWith('admin-')) backend.permissions.push(p)
    else portal.permissions.push(p)
  }
  // 按 MENU_ORDER 排序;未列入 MENU_ORDER 的排最后
  const orderIdx = new Map(MENU_ORDER.map((k, i) => [k, i]))
  const sortByOrder = list => [...list].sort((a, b) => (orderIdx.get(a.key) ?? 999) - (orderIdx.get(b.key) ?? 999))
  backend.permissions = sortByOrder(backend.permissions)
  portal.permissions = sortByOrder(portal.permissions)
  return [backend, portal].filter(g => g.permissions.length)
})

// 按角色类型只显示对应的菜单组
const visibleMenuGroups = computed(() => {
  const target = isAdminRole.value ? 'admin' : 'portal'
  return menuPermissionGroups.value.filter(g => g.id === target)
})

// 按顺序排列的当前角色菜单列表（flat，用于菜单权限区渲染）
// menu:profile(基础信息) 是默认权限,不纳入菜单权限配置,故过滤掉
const orderedMenuList = computed(() => {
  const keys = new Set()
  for (const g of visibleMenuGroups.value) {
    for (const p of g.permissions) {
      if (p.key === 'menu:profile') continue
      keys.add(p.key)
    }
  }
  const ordered = MENU_ORDER.filter(k => keys.has(k))
  const remaining = [...keys].filter(k => !MENU_ORDER.includes(k))
  return [...ordered, ...remaining].map(key => {
    const perm = allPermissions.value.find(p => p.key === key)
    return perm || { key, name: key, module: 'menu', action: key.replace('menu:', '') }
  })
})

// 只读态:内置角色(is_system)权限集不可改,或操作者没有 role:edit 时整个权限区只读展示
const permReadonly = computed(() => !isCreating.value && (!!selectedRole.value?.is_system || !can('role:edit')))

// 「全权限」模板化展示仅适用于内置 admin 角色(is_system 且 name==='admin',其权限走 is_portal_admin 超管旁路,DB 无逐条授权)。
// 其余角色(含内置 user、自定义角色、只读查看)一律按真实 selectedPerms 显示选中态——否则只读查看者会把最简角色误看成全权限。
const showAllPerms = computed(() => !isCreating.value && !!selectedRole.value?.is_system && selectedRole.value?.name === 'admin')

// 按钮权限分组（按页面/菜单归组，只展示「操作按钮」；查看类为隐式默认随菜单授予，不展示）
// 与菜单权限联动:只展示已勾选页面的按钮;内置角色(permReadonly)不联动,展示该类型全部页面按钮
const buttonGroups = computed(() => {
  const rows = []
  for (const m of orderedMenuList.value) {
    const cfg = MENU_TO_BUTTONS[m.key]
    const buttons = cfg ? cfg.buttons : []
    if (!buttons.length) continue
    if (!permReadonly.value && !selectedPerms.value.has(m.key)) continue
    rows.push({ menuKey: m.key, menuName: m.name, buttons })
  }
  return rows
})

// 每行（每个页面）按钮的全选/半选/切换（只切该行按钮，不动菜单勾选）
function rowAllSelected(row) {
  return row.buttons.length > 0 && row.buttons.every(b => selectedPerms.value.has(b.key))
}
function rowSomeSelected(row) {
  return row.buttons.some(b => selectedPerms.value.has(b.key))
}
function toggleRowAll(row) {
  const newSet = new Set(selectedPerms.value)
  const allSel = rowAllSelected(row)
  const kept = []
  for (const b of row.buttons) {
    if (allSel) {
      // 取消整行按钮: 保留被其它勾选菜单「隐式必需」的权限(避免破坏依赖它的页面)
      if (isImplicitRequired(b.key)) kept.push(b.key)
      else newSet.delete(b.key)
    } else {
      newSet.add(b.key)
    }
  }
  if (kept.length) {
    showToast(`「${kept.join('」「')}」被其他菜单必需,已保留;先取消对应菜单即可移除`, 'error')
  }
  selectedPerms.value = newSet
}

function displayName(role) {
  if (role.name === 'admin') return '超级管理员'
  if (role.name === 'user') return '普通用户'
  return role.name
}


// 操作权限分组全选/半选
function groupAllSelected(group) {
  return group.permissions.length > 0 && group.permissions.every(p => selectedPerms.value.has(p.key))
}
function groupSomeSelected(group) {
  return group.permissions.some(p => selectedPerms.value.has(p.key))
}
function toggleGroupAll(group) {
  const newSet = new Set(selectedPerms.value)
  const allSel = groupAllSelected(group)
  const groupMenuKeys = group.permissions.map(p => p.key)
  for (const p of group.permissions) {
    if (allSel) newSet.delete(p.key)
    else newSet.add(p.key)
  }
  // 联动操作权限(与 togglePerm 单菜单联动一致):
  // 全选 -> 自动勾选该组菜单对应的操作权限;取消全选 -> 移除,但保留仍被其他勾选菜单引用的权限
  if (allSel) {
    for (const menuKey of groupMenuKeys) {
      for (const opKey of (MENU_TO_OPS[menuKey] || [])) {
        const stillReferenced = orderedMenuList.value.some(m =>
          newSet.has(m.key) && (MENU_TO_OPS[m.key] || []).includes(opKey)
        )
        if (!stillReferenced) newSet.delete(opKey)
      }
    }
  } else {
    for (const menuKey of groupMenuKeys) {
      for (const opKey of (MENU_TO_OPS[menuKey] || [])) newSet.add(opKey)
    }
  }
  selectedPerms.value = newSet
}

// 某操作权限被哪些勾选菜单「隐式必需」(其页面功能依赖,如审核页需 skill:edit、配置页需 system:config),返回菜单名列表,用于锁定标识与解锁提示
function implicitRequiredBy(key) {
  return orderedMenuList.value
    .filter(m => selectedPerms.value.has(m.key) && (MENU_TO_BUTTONS[m.key]?.implicit || []).includes(key))
    .map(m => m.name)
}
// 是否被任一勾选菜单隐式必需(必需则不可单独移除)
function isImplicitRequired(key) {
  return implicitRequiredBy(key).length > 0
}
// chip 被锁时的提示文案
function lockedHint(key) {
  const req = implicitRequiredBy(key)
  return req.length ? `该权限被「${req.join('」「')}」菜单必需,先取消对应菜单即可移除` : ''
}

function togglePerm(key) {
  const newSet = new Set(selectedPerms.value)
  if (newSet.has(key)) {
    if (key.startsWith('menu:')) {
      newSet.delete(key)
      // 移除菜单时,同步移除该菜单对应的操作权限(但保留其他勾选菜单仍引用的权限)
      for (const opKey of (MENU_TO_OPS[key] || [])) {
        const stillReferenced = orderedMenuList.value.some(m =>
          newSet.has(m.key) && (MENU_TO_OPS[m.key] || []).includes(opKey)
        )
        if (!stillReferenced) newSet.delete(opKey)
      }
    } else if (isImplicitRequired(key)) {
      // 该按钮被其它勾选菜单「隐式必需」(如审核页加载依赖 skill:edit),取消会破坏依赖它的页面 → 拒绝并提示
      showToast(lockedHint(key) || '该权限被其他菜单必需,先取消对应菜单即可移除', 'error')
      return
    } else {
      newSet.delete(key)
    }
  } else {
    newSet.add(key)
    // 添加菜单时,同步添加该菜单对应的操作权限
    if (key.startsWith('menu:')) {
      for (const opKey of (MENU_TO_OPS[key] || [])) newSet.add(opKey)
    }
  }
  selectedPerms.value = newSet
}

function applyInherit() {
  const newSet = new Set()
  for (const p of allPermissions.value) {
    if (inheritFrom.value === 'admin') {
      // 后台角色: 后台菜单 + 后台操作
      if (p.module === 'menu' && p.action.startsWith('admin-')) newSet.add(p.key)
      if (p.module !== 'menu' && ADMIN_OP_KEYS.has(p.key)) newSet.add(p.key)
    } else if (inheritFrom.value === 'user') {
      // 用户侧角色: 用户侧菜单 + 用户侧操作(menu:profile 为默认权限、menu:submit 归入「我的技能」不独立展示,都不授予)
      if (p.module === 'menu' && p.key !== 'menu:profile' && p.key !== 'menu:submit' && !p.action.startsWith('admin-')) newSet.add(p.key)
      if (p.module !== 'menu' && PORTAL_OP_KEYS.has(p.key)) newSet.add(p.key)
    }
    // 'custom': 保持为空，从零开始
  }
  selectedPerms.value = newSet
}

async function fetchRoles() {
  loading.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/roles`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.status === 401) return router.push('/admin/login')
    if (res.status === 403) {
      showToast('无角色查看权限', 'error')
      return router.replace('/admin')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '获取角色列表失败'))
    roles.value = data.data || []
    // 保持选中状态
    if (selectedRole.value) {
      const updated = roles.value.find(r => r.id === selectedRole.value.id)
      if (updated) selectedRole.value = updated
      else selectedRole.value = null
    }
    // 恢复选中: 优先按 URL ?role= 还原上次位置, 否则默认第一个自定义角色
    if (!selectedRole.value && !isCreating.value) {
      const qid = Number(route.query.role)
      const target = (qid && roles.value.find(r => r.id === qid)) || customRoles.value[0]
      if (target) selectRole(target)
    }
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    loading.value = false
  }
}

async function fetchPermissions() {
  try {
    const res = await fetch(`${API_BASE}/admin/permissions`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) return
    const data = await res.json().catch(() => ({}))
    allPermissions.value = data.data || []
  } catch {}
}

function selectRole(role) {
  // 新建模式时点击左侧角色列表,退出新建并进入编辑
  isCreating.value = false
  selectedRole.value = role
  formDesc.value = role.description || ''
  selectedPerms.value = new Set(role.permissions || [])
  // 持久化选中位置到 URL query, 刷新后据此恢复(否则回落到第一个)
  router.replace({ query: { ...route.query, role: String(role.id) } })
}

function startNewRole() {
  isCreating.value = true
  selectedRole.value = null
  formName.value = ''
  formDesc.value = ''
  inheritFrom.value = 'custom'
  selectedPerms.value = new Set()
}

function cancelNewRole() {
  isCreating.value = false
  // 恢复选中之前选中的角色
  if (roles.value.length) {
    const firstCustom = customRoles.value[0]
    if (firstCustom) selectRole(firstCustom)
  }
}

async function saveNewRole() {
  if (!formName.value.trim()) return
  saving.value = true
  try {
    const keys = [...selectedPerms.value]
    const res = await fetch(`${API_BASE}/admin/roles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: formName.value, keys, inherit_from: inheritFrom.value }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(errMsg(err, '新建角色失败'))
    }
    const data = await res.json()
    showToast('角色已创建', 'success')
    isCreating.value = false
    await fetchRoles()
    // 选中新创建的角色
    if (data.data && data.data.id) {
      const created = roles.value.find(r => r.id === data.data.id)
      if (created) selectRole(created)
    }
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    saving.value = false
  }
}

async function saveEditRole() {
  if (!selectedRole.value) return
  saving.value = true
  try {
    const id = selectedRole.value.id
    const isSystem = selectedRole.value.is_system
    const keys = [...selectedPerms.value]

    // 更新权限集（内置角色跳过——后端也会拒）
    if (!isSystem) {
      const permRes = await fetch(`${API_BASE}/admin/roles/${id}/permissions`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
      })
      if (!permRes.ok) {
        const err = await permRes.json().catch(() => ({}))
        throw new Error(errMsg(err, '更新权限位失败'))
      }
    }
    showToast('角色已更新', 'success')
    await fetchRoles()
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    saving.value = false
  }
}

function confirmDelete(role) { deletingRole.value = role }

async function doDelete() {
  if (!deletingRole.value || deleting.value) return
  deleting.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/roles/${deletingRole.value.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '删除失败'))
    const deletedId = deletingRole.value.id
    deletingRole.value = null
    showToast('角色已删除', 'success')
    await fetchRoles()
    // 如果删除的是当前选中的角色，清空选中
    if (selectedRole.value?.id === deletedId) {
      selectedRole.value = null
    }
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  // 三请求并行: roles/permissions 不消费 loadPermissions 结果, 无需 await 白等一个 RTT
  loadPermissions()
  fetchRoles()
  fetchPermissions()
})
</script>
