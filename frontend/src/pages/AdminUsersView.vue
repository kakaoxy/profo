<template>
  <div class="admin-layout">
    <div class="admin-header">
      <h1 class="admin-title">用户管理</h1>
      <p class="admin-description">管理系统用户，包括新增、编辑、删除用户和修改用户状态</p>
    </div>
    
    <div class="admin-content">
      <UserList />
    </div>
  </div>
</template>

<script setup lang="ts">
import UserList from '@/components/user_management/UserList.vue'
</script>

<style scoped>
.admin-layout {
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}

.admin-header {
  margin-bottom: 2rem;
}

.admin-title {
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.5rem 0;
}

.admin-description {
  font-size: 1rem;
  color: #6b7280;
  margin: 0;
}

.admin-content {
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  padding: 1rem;
}
</style>