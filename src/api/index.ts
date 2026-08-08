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
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    const xToken = localStorage.getItem('xToken')
    if (xToken) {
      config.headers['X-Token'] = xToken
    }
    const at = localStorage.getItem('at')
    if (at) {
      config.headers['X-AT'] = at
    }
    const deviceSig = localStorage.getItem('deviceSig')
    if (deviceSig) {
      config.headers['X-DeviceSig'] = deviceSig
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
        localStorage.removeItem('token')
        localStorage.removeItem('xToken')
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
        localStorage.removeItem('token')
        localStorage.removeItem('xToken')
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

export default service

export function get<T = any>(url: string, params?: any): Promise<ApiResponse<T>> {
  return service.get(url, { params }).then((res) => res.data)
}

export function post<T = any>(url: string, data?: any): Promise<ApiResponse<T>> {
  return service.post(url, data).then((res) => res.data)
}

export function put<T = any>(url: string, data?: any, params?: any): Promise<ApiResponse<T>> {
  return service.put(url, data, { params }).then((res) => res.data)
}

export function del<T = any>(url: string, params?: any): Promise<ApiResponse<T>> {
  return service.delete(url, { params }).then((res) => res.data)
}
