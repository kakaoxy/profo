<template>
  <div class="role-list-container">
    <div class="role-list-header">
      <h2 class="role-list-title">角色管理</h2>
      <button class="btn btn-primary" @click="showCreateModal = true">
        <i class="icon-plus"></i> 新增角色
      </button>
    </div>

    <!-- Search -->
    <div class="role-list-search">
      <input
        v-model="searchQuery"
        type="text"
        class="form-input"
        placeholder="搜索角色名称或代码..."
        @input="onSearch"
      />
    </div>

    <!-- Role Table -->
    <div class="role-table-wrapper">
      <table class="role-table">
        <thead>
          <tr>
            <th>角色名称</th>
            <th>角色代码</th>
            <th>描述</th>
            <th>权限</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="role in roles" :key="role.id">
            <td>{{ role.name }}</td>
            <td>{{ role.code }}</td>
            <td>{{ role.description || '-' }}</td>
            <td class="permissions-column">
              <div class="permission-tags">
                <span v-for="(permission, index) in role.permissions" :key="index" class="permission-tag">
                  {{ permission }}
                </span>
                <span v-if="role.permissions.length === 0" class="no-permissions">无权限</span>
              </div>
            </td>
            <td>
              <span :class="['status-badge', role.is_active ? 'active' : 'inactive']">
                {{ role.is_active ? '激活' : '未激活' }}
              </span>
            </td>
            <td>{{ formatDate(role.created_at) }}</td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-secondary" @click="editRole(role)">
                <i class="icon-edit"></i> 编辑
              </button>
              <button class="btn btn-sm btn-danger" @click="deleteRole(role)">
                <i class="icon-delete"></i> 删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty State -->
      <div v-if="roles.length === 0" class="empty-state">
        <p>暂无角色数据</p>
      </div>
    </div>

    <!-- Pagination -->
    <div class="pagination-container">
      <Pagination
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @update:current-page="onPageChange"
      />
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || showEditModal" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ showEditModal ? '编辑角色' : '新增角色' }}</h3>
          <button class="modal-close" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="saveRole">
            <div class="form-group">
              <label for="name" class="form-label">角色名称 <span class="required">*</span></label>
              <input
                id="name"
                v-model="form.name"
                type="text"
                class="form-input"
                placeholder="请输入角色名称"
                required
              />
            </div>

            <div class="form-group">
              <label for="code" class="form-label">角色代码 <span class="required">*</span></label>
              <input
                id="code"
                v-model="form.code"
                type="text"
                class="form-input"
                placeholder="请输入角色代码"
                :disabled="showEditModal"
                required
              />
              <small v-if="showEditModal" class="form-hint">角色代码不可修改</small>
            </div>

            <div class="form-group">
              <label for="description" class="form-label">描述</label>
              <textarea
                id="description"
                v-model="form.description"
                class="form-textarea"
                placeholder="请输入角色描述"
                rows="3"
              ></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">权限配置 <span class="required">*</span></label>
              <div class="permission-selector">
                <label v-for="permission in allPermissions" :key="permission" class="permission-item">
                  <input
                    type="checkbox"
                    v-model="form.permissions"
                    :value="permission"
                  />
                  <span>{{ permission }}</span>
                </label>
              </div>
              <small class="form-hint">请至少选择一项权限</small>
            </div>

            <div class="form-group">
              <label for="is_active" class="form-label">状态 <span class="required">*</span></label>
              <select id="is_active" v-model="form.is_active" class="form-select" required>
                <option :value="true">激活</option>
                <option :value="false">未激活</option>
              </select>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" @click="closeModal">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="isLoading || !isFormValid">
                <span v-if="isLoading">保存中...</span>
                <span v-else>保存</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import apiClient from '../../api/client';
import Pagination from '../Pagination.vue';

// Interfaces
interface Role {
  id: string;
  name: string;
  code: string;
  description: string;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RoleListResponse {
  total: number;
  items: Role[];
}

// States
const showCreateModal = ref(false);
const showEditModal = ref(false);
const currentRoleId = ref<string | null>(null);
const isLoading = ref(false);

// Filters
const searchQuery = ref('');
const page = ref(1);
const pageSize = ref(20);

// All available permissions
const allPermissions = ref([
  'view_data',
  'edit_data',
  'manage_users',
  'manage_roles'
]);

// Form Data
const form = ref({
  name: '',
  code: '',
  description: '',
  permissions: [] as string[],
  is_active: true
});

// Query Client
const queryClient = useQueryClient();

// Queries
const {
  data: rolesData
} = useQuery<RoleListResponse>({
  queryKey: ['roles', {
    name: searchQuery.value,
    code: searchQuery.value,
    page: page.value,
    page_size: pageSize.value
  }],
  queryFn: async () => {
    return apiClient.get('/users/roles', {
      params: {
        name: searchQuery.value,
        code: searchQuery.value,
        page: page.value,
        page_size: pageSize.value
      }
    });
  }
});

// Computed
const roles = computed(() => rolesData.value?.items || []);
const total = computed(() => rolesData.value?.total || 0);
const isFormValid = computed(() => {
  return form.value.name.trim() && form.value.code.trim() && form.value.permissions.length > 0;
});

// Methods
const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN');
};

const onSearch = () => {
  page.value = 1;
  queryClient.invalidateQueries({ queryKey: ['roles'] });
};

const onPageChange = (newPage: number) => {
  page.value = newPage;
  queryClient.invalidateQueries({ queryKey: ['roles'] });
};

const closeModal = () => {
  showCreateModal.value = false;
  showEditModal.value = false;
  resetForm();
};

const resetForm = () => {
  form.value = {
    name: '',
    code: '',
    description: '',
    permissions: [],
    is_active: true
  };
  currentRoleId.value = null;
};

const editRole = (role: Role) => {
  form.value = {
    name: role.name,
    code: role.code,
    description: role.description || '',
    permissions: [...role.permissions],
    is_active: role.is_active
  };
  currentRoleId.value = role.id;
  showEditModal.value = true;
};

const deleteRole = async (role: Role) => {
  if (confirm(`确定要删除角色 ${role.name} 吗？`)) {
    try {
      await apiClient.delete(`/users/roles/${role.id}`);
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    } catch (error) {
      console.error('删除角色失败:', error);
      alert('删除角色失败，请重试');
    }
  }
};

const saveRole = async () => {
  isLoading.value = true;
  try {
    if (showEditModal.value && currentRoleId.value) {
      // Update role
      await apiClient.put(`/users/roles/${currentRoleId.value}`, form.value);
    } else {
      // Create role
      await apiClient.post('/users/roles', form.value);
    }
    queryClient.invalidateQueries({ queryKey: ['roles'] });
    closeModal();
  } catch (error) {
    console.error('保存角色失败:', error);
    alert('保存角色失败，请重试');
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped>
.role-list-container {
  padding: 1rem;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.role-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.role-list-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  color: #333;
}

.role-list-search {
  margin-bottom: 1rem;
}

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

.role-table-wrapper {
  overflow-x: auto;
  margin-bottom: 1rem;
}

.role-table {
  width: 100%;
  border-collapse: collapse;
  background-color: #fff;
}

.role-table th,
.role-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.role-table th {
  background-color: #f5f7fa;
  font-weight: 600;
  color: #333;
}

.role-table tr:hover {
  background-color: #f5f7fa;
}

.permissions-column {
  width: 300px;
}

.permission-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.permission-tag {
  padding: 0.25rem 0.5rem;
  background-color: #e8f0fe;
  color: #1976d2;
  border-radius: 4px;
  font-size: 0.8rem;
}

.no-permissions {
  color: #909399;
  font-size: 0.8rem;
}

.status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-badge.active {
  background-color: #e8f5e9;
  color: #4caf50;
}

.status-badge.inactive {
  background-color: #fff3e0;
  color: #ff9800;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background-color: #409eff;
  color: white;
}

.btn-primary:hover {
  background-color: #66b1ff;
}

.btn-secondary {
  background-color: #909399;
  color: white;
}

.btn-secondary:hover {
  background-color: #a6a9ad;
}

.btn-danger {
  background-color: #f56c6c;
  color: white;
}

.btn-danger:hover {
  background-color: #f78989;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: #909399;
}

.pagination-container {
  display: flex;
  justify-content: center;
  margin-top: 1rem;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #909399;
}

.modal-close:hover {
  color: #333;
}

.modal-body {
  padding: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #333;
}

.required {
  color: #f56c6c;
}

.form-hint {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: #909399;
}

.permission-selector {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.permission-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.permission-item input[type="checkbox"] {
  cursor: pointer;
}

.permission-item span {
  font-size: 0.9rem;
  color: #333;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}
</style>