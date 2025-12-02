<template>
  <div class="user-list-container">
    <div class="user-list-header">
      <h2 class="user-list-title">用户管理</h2>
      <button class="btn btn-primary" @click="showCreateModal = true">
        <i class="icon-plus"></i> 新增用户
      </button>
    </div>

    <!-- Search and Filter -->
    <div class="user-list-filters">
      <div class="filter-group">
        <input
          v-model="searchQuery"
          type="text"
          class="form-input"
          placeholder="搜索用户名或昵称..."
          @input="onSearch"
        />
      </div>
      <div class="filter-group">
        <select v-model="roleFilter" class="form-select" @change="onFilter">
          <option value="">所有角色</option>
          <option v-for="role in roles" :key="role.id" :value="role.id">
            {{ role.name }}
          </option>
        </select>
      </div>
      <div class="filter-group">
        <select v-model="statusFilter" class="form-select" @change="onFilter">
          <option value="">所有状态</option>
          <option value="active">激活</option>
          <option value="inactive">未激活</option>
          <option value="banned">禁用</option>
        </select>
      </div>
    </div>

    <!-- User Table -->
    <div class="user-table-wrapper">
      <table class="user-table">
        <thead>
          <tr>
            <th>用户名</th>
            <th>昵称</th>
            <th>角色</th>
            <th>手机号</th>
            <th>状态</th>
            <th>最后登录</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.username }}</td>
            <td>{{ user.nickname || '-' }}</td>
            <td>{{ user.role.name }}</td>
            <td>{{ user.phone || '-' }}</td>
            <td>
              <span :class="['status-badge', user.status]">
                {{ user.status === 'active' ? '激活' : user.status === 'inactive' ? '未激活' : '禁用' }}
              </span>
            </td>
            <td>{{ formatDate(user.last_login_at) || '-' }}</td>
            <td>{{ formatDate(user.created_at) }}</td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-secondary" @click="editUser(user)">
                <i class="icon-edit"></i> 编辑
              </button>
              <button class="btn btn-sm btn-danger" @click="deleteUser(user)">
                <i class="icon-delete"></i> 删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty State -->
      <div v-if="users.length === 0" class="empty-state">
        <p>暂无用户数据</p>
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
          <h3>{{ showEditModal ? '编辑用户' : '新增用户' }}</h3>
          <button class="modal-close" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="saveUser">
            <div class="form-group">
              <label for="username" class="form-label">用户名 <span class="required">*</span></label>
              <input
                id="username"
                v-model="form.username"
                type="text"
                class="form-input"
                placeholder="请输入用户名"
                required
              />
            </div>

            <div v-if="!showEditModal" class="form-group">
              <label for="password" class="form-label">密码 <span class="required">*</span></label>
              <input
                id="password"
                v-model="form.password"
                type="password"
                class="form-input"
                placeholder="请输入密码"
                required
              />
            </div>

            <div class="form-group">
              <label for="nickname" class="form-label">昵称</label>
              <input
                id="nickname"
                v-model="form.nickname"
                type="text"
                class="form-input"
                placeholder="请输入昵称"
              />
            </div>

            <div class="form-group">
              <label for="phone" class="form-label">手机号</label>
              <input
                id="phone"
                v-model="form.phone"
                type="tel"
                class="form-input"
                placeholder="请输入手机号"
              />
            </div>

            <div class="form-group">
              <label for="role_id" class="form-label">角色 <span class="required">*</span></label>
              <select id="role_id" v-model="form.role_id" class="form-select" required>
                <option value="">请选择角色</option>
                <option v-for="role in roles" :key="role.id" :value="role.id">
                  {{ role.name }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label for="status" class="form-label">状态 <span class="required">*</span></label>
              <select id="status" v-model="form.status" class="form-select" required>
                <option value="active">激活</option>
                <option value="inactive">未激活</option>
                <option value="banned">禁用</option>
              </select>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" @click="closeModal">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="isLoading">
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

interface User {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  phone: string;
  role_id: string;
  role: Role;
  status: string;
  last_login_at: string;
  created_at: string;
  updated_at: string;
}

interface UserListResponse {
  total: number;
  items: User[];
}

interface RoleListResponse {
  total: number;
  items: Role[];
}

// States
const showCreateModal = ref(false);
const showEditModal = ref(false);
const currentUserId = ref<string | null>(null);
const isLoading = ref(false);

// Filters
const searchQuery = ref('');
const roleFilter = ref('');
const statusFilter = ref('');
const page = ref(1);
const pageSize = ref(20);

// Form Data
const form = ref({
  username: '',
  password: '',
  nickname: '',
  phone: '',
  role_id: '',
  status: 'active'
});

// Query Client
const queryClient = useQueryClient();

// Queries
const {
  data: rolesData
} = useQuery<RoleListResponse>({
  queryKey: ['roles'],
  queryFn: async () => {
    return apiClient.get('/users/roles');
  }
});

const {
  data: usersData
} = useQuery<UserListResponse>({
  queryKey: ['users', {
    search: searchQuery.value,
    role_id: roleFilter.value,
    status: statusFilter.value,
    page: page.value,
    page_size: pageSize.value
  }],
  queryFn: async () => {
    return apiClient.get('/users/users', {
      params: {
        username: searchQuery.value,
        nickname: searchQuery.value,
        role_id: roleFilter.value,
        status: statusFilter.value,
        page: page.value,
        page_size: pageSize.value
      }
    });
  }
});

// Computed
const users = computed(() => usersData.value?.items || []);
const total = computed(() => usersData.value?.total || 0);
const roles = computed(() => rolesData.value?.items || []);

// Methods
const formatDate = (dateString: string | null): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN');
};

const onSearch = () => {
  page.value = 1;
  queryClient.invalidateQueries({ queryKey: ['users'] });
};

const onFilter = () => {
  page.value = 1;
  queryClient.invalidateQueries({ queryKey: ['users'] });
};

const onPageChange = (newPage: number) => {
  page.value = newPage;
  queryClient.invalidateQueries({ queryKey: ['users'] });
};

const closeModal = () => {
  showCreateModal.value = false;
  showEditModal.value = false;
  resetForm();
};

const resetForm = () => {
  form.value = {
    username: '',
    password: '',
    nickname: '',
    phone: '',
    role_id: '',
    status: 'active'
  };
  currentUserId.value = null;
};

const editUser = (user: User) => {
  form.value = {
    username: user.username,
    password: '',
    nickname: user.nickname || '',
    phone: user.phone || '',
    role_id: user.role_id,
    status: user.status
  };
  currentUserId.value = user.id;
  showEditModal.value = true;
};

const deleteUser = async (user: User) => {
  if (confirm(`确定要删除用户 ${user.username} 吗？`)) {
    try {
      await apiClient.delete(`/users/users/${user.id}`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      alert('用户删除成功');
    } catch (error) {
      console.error('删除用户失败:', error);
      alert('删除用户失败，请重试');
    }
  }
};

const saveUser = async () => {
  isLoading.value = true;
  try {
    if (showEditModal.value && currentUserId.value) {
      // Update user
      await apiClient.put(`/users/users/${currentUserId.value}`, {
        ...form.value,
        // Don't send password if it's empty when updating
        password: form.value.password ? form.value.password : undefined
      });
    } else {
      // Create user
      await apiClient.post('/users/users', form.value);
    }
    queryClient.invalidateQueries({ queryKey: ['users'] });
    closeModal();
  } catch (error) {
    console.error('保存用户失败:', error);
    alert('保存用户失败，请重试');
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped>
.user-list-container {
  padding: 1rem;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.user-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.user-list-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  color: #333;
}

.user-list-filters {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.filter-group {
  flex: 1;
  min-width: 150px;
}

.form-input,
.form-select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.user-table-wrapper {
  overflow-x: auto;
  margin-bottom: 1rem;
}

.user-table {
  width: 100%;
  border-collapse: collapse;
  background-color: #fff;
}

.user-table th,
.user-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.user-table th {
  background-color: #f5f7fa;
  font-weight: 600;
  color: #333;
}

.user-table tr:hover {
  background-color: #f5f7fa;
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

.status-badge.banned {
  background-color: #ffebee;
  color: #f44336;
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
  max-width: 500px;
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

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}
</style>