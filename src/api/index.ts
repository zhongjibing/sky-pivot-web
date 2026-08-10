import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

const service: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 30000,
})

service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const at = localStorage.getItem('at')
    if (at) {
      config.headers.Authorization = `Bearer ${at}`
    }
    const st = localStorage.getItem('st')
    if (st) {
      config.headers['X-ST'] = st
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

service.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data
    if (res.code !== 200 && res.code !== 0) {
      ElMessage.error(res.message || 'Request failed')
      if (res.code === 401) {
        clearAuthStorage()
        router.push('/login')
      }
      return Promise.reject(new Error(res.message || 'Request failed'))
    }
    return response
  },
  (error) => {
    if (error.response) {
      const status = error.response.status
      const data = error.response.data
      if (status === 401) {
        clearAuthStorage()
        router.push('/login')
        ElMessage.error('Session expired, please login again')
      } else if (data && data.message) {
        ElMessage.error(data.message)
      } else {
        ElMessage.error(`Request error (${status})`)
      }
    } else {
      ElMessage.error('Network error')
    }
    return Promise.reject(error)
  }
)

function clearAuthStorage() {
  localStorage.removeItem('at')
  localStorage.removeItem('atExpiresAt')
  localStorage.removeItem('st')
  localStorage.removeItem('userId')
  localStorage.removeItem('deviceId')
  localStorage.removeItem('token')
  localStorage.removeItem('xToken')
}

export default service

export function get<T = any>(url: string, params?: any): Promise<T> {
  return service.get(url, { params }).then((res) => res.data.data as T)
}

export function post<T = any>(url: string, data?: any): Promise<T> {
  return service.post(url, data).then((res) => res.data.data as T)
}

export function put<T = any>(url: string, data?: any, params?: any): Promise<T> {
  return service.put(url, data, { params }).then((res) => res.data.data as T)
}

export function del<T = any>(url: string, params?: any): Promise<T> {
  return service.delete(url, { params }).then((res) => res.data.data as T)
}
