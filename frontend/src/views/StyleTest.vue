<template>
  <div class="p-8 space-y-6">
    <h1 class="text-3xl font-bold text-gray-900">TailwindCSS 样式测试</h1>
    
    <!-- 测试自定义颜色 -->
    <div class="card">
      <h2 class="text-xl font-semibold mb-4">自定义颜色测试</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-primary-50 p-4 rounded text-center">primary-50</div>
        <div class="bg-primary-100 p-4 rounded text-center">primary-100</div>
        <div class="bg-primary-200 p-4 rounded text-center">primary-200</div>
        <div class="bg-primary-300 p-4 rounded text-center">primary-300</div>
        <div class="bg-primary-400 p-4 rounded text-center text-white">primary-400</div>
        <div class="bg-primary-500 p-4 rounded text-center text-white">primary-500</div>
        <div class="bg-primary-600 p-4 rounded text-center text-white">primary-600</div>
        <div class="bg-primary-700 p-4 rounded text-center text-white">primary-700</div>
      </div>
    </div>

    <!-- 测试按钮样式 -->
    <div class="card">
      <h2 class="text-xl font-semibold mb-4">按钮样式测试</h2>
      <div class="space-x-4">
        <button class="btn-primary">主要按钮</button>
        <button class="btn-secondary">次要按钮</button>
        <button class="btn-danger">危险按钮</button>
        <button class="btn-outline">轮廓按钮</button>
        <button class="btn-primary" disabled>禁用按钮</button>
      </div>
    </div>

    <!-- 测试表单样式 -->
    <div class="card">
      <h2 class="text-xl font-semibold mb-4">表单样式测试</h2>
      <div class="space-y-4 max-w-md">
        <div>
          <label class="label">输入框</label>
          <input type="text" class="input-field" placeholder="请输入内容" />
        </div>
        <div>
          <label class="label">选择框</label>
          <select class="input-field">
            <option>选项 1</option>
            <option>选项 2</option>
          </select>
        </div>
        <div>
          <label class="label">文本域</label>
          <textarea class="input-field" rows="3" placeholder="请输入多行文本"></textarea>
        </div>
        <div class="form-error">这是一个错误提示示例</div>
      </div>
    </div>

    <!-- 测试状态徽章 -->
    <div class="card">
      <h2 class="text-xl font-semibold mb-4">状态徽章测试</h2>
      <div class="space-x-2">
        <span class="status-badge status-success">成功</span>
        <span class="status-badge status-warning">警告</span>
        <span class="status-badge status-error">错误</span>
        <span class="status-badge status-info">信息</span>
      </div>
    </div>

    <!-- 测试表格样式 -->
    <div class="card">
      <h2 class="text-xl font-semibold mb-4">表格样式测试</h2>
      <table class="min-w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="table-header">姓名</th>
            <th class="table-header">邮箱</th>
            <th class="table-header">状态</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr>
            <td class="table-cell">张三</td>
            <td class="table-cell">zhangsan@example.com</td>
            <td class="table-cell">
              <span class="status-badge status-success">活跃</span>
            </td>
          </tr>
          <tr>
            <td class="table-cell">李四</td>
            <td class="table-cell">lisi@example.com</td>
            <td class="table-cell">
              <span class="status-badge status-warning">待审核</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 测试加载动画 -->
    <div class="card">
      <h2 class="text-xl font-semibold mb-4">加载动画测试</h2>
      <div class="flex items-center space-x-4">
        <div class="loading-spinner h-8 w-8"></div>
        <span>加载中...</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 这个组件用于测试所有 TailwindCSS 样式是否正常工作
</script>
