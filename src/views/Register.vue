<template>
  <div class="register-page">
    <div class="register-card">
      <div class="register-header">
        <el-icon :size="40" color="#409eff"><Lock /></el-icon>
        <h1 class="register-title">Create Account</h1>
        <p class="register-subtitle">Register with OPAQUE zero-knowledge authentication</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="Email / Username" prop="identifier">
          <el-input v-model="form.identifier" placeholder="Enter your email or username" />
        </el-form-item>
        <el-form-item label="Master Password" prop="password">
          <el-input v-model="form.password" type="password" placeholder="Create a strong master password" show-password />
        </el-form-item>
        <el-form-item label="Confirm Master Password" prop="confirmPassword">
          <el-input v-model="form.confirmPassword" type="password" placeholder="Re-enter master password" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" class="register-btn" @click="handleRegister">
            Register
          </el-button>
        </el-form-item>
      </el-form>

      <div class="register-footer">
        <p>Already have an account? <router-link to="/login">Login</router-link></p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'

interface RegisterForm {
  identifier: string
  password: string
  confirmPassword: string
}

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive<RegisterForm>({
  identifier: '',
  password: '',
  confirmPassword: '',
})

const rules: FormRules<RegisterForm> = {
  identifier: [{ required: true, message: 'Please enter your email or username', trigger: 'blur' }],
  password: [
    { required: true, message: 'Please create a master password', trigger: 'blur' },
    { min: 8, message: 'Password must be at least 8 characters', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: 'Please confirm your master password', trigger: 'blur' },
    {
      validator: (_rule, value, cb) => {
        if (value !== form.password) cb(new Error('Passwords do not match'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}

async function handleRegister() {
  if (!formRef.value) return
  await formRef.value.validate((valid) => {
    if (valid) {
      // OPAQUE registration — Phase 2.2.1
    }
  })
}
</script>

<style scoped>
.register-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.register-card {
  width: 420px;
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
.register-header {
  text-align: center;
  margin-bottom: 32px;
}
.register-title {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
  margin: 12px 0 4px;
}
.register-subtitle {
  font-size: 13px;
  color: #909399;
  margin: 0;
}
.register-btn {
  width: 100%;
}
.register-footer {
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: #909399;
}
.register-footer a {
  color: #409eff;
  text-decoration: none;
}
</style>
