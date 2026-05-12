---
name: yxzn
description: >-
  使用 @yxzn 组件库生态开发业务页面的规范与写法。包含 EzTable、EzDescriptions、EzUpload 等 Element Plus
  封装组件，以及 useTable、useDate、createAxios 等 composable，@yxzn/utils、@yxzn/validator、
  @yxzn/filter、@yxzn/calc、@yxzn/directive 工具包。开发列表页、详情页、表单页时必须遵循本规范。
metadata:
  version: "1.0.0"
---

# @yxzn 业务开发规范

> 基于 `@yxzn/easyel`（Element Plus 封装）+ `@yxzn/*` 工具包的业务组件库生态。
> 项目中所有列表、详情、表单页面均使用此规范，写法保持一致。

## Preferences

- 全局注册后模板中直接使用 `<ez-table>`、`<ez-descriptions>`、`<ez-upload>` 等标签
- `useTable`、`useDate`、`createAxios` 等通过 `import { ... } from '@yxzn/easyel'` 引入
- 始终使用 `<script setup lang="ts">` + Composition API
- **禁止使用 `any`**，所有泛型必须带上业务类型
- 每个模块目录创建 `{模块名}Module.d.ts`，接口按 `I{模块名}Row`、`I{模块名}Search`、`I{模块名}Form`、`I{模块名}Detail` 命名，各接口独立定义不使用继承
- 列表查询条件 `query` 使用 `reactive`，`useTable` 带双泛型 `<TRow, TQuery>`
- `EzDescriptions` 展示详情时通过 `:fields` prop 传入 `reactive<EzDescriptionsField<T>[]>`，接口回调后用 `assignArrayByKey` 批量赋值
- `EzDescriptions` 作为表单布局容器时，`el-form-item` 直接放入默认插槽，不需要额外 class
- `EzUpload` 三件套：`defaultFiles`（回显）+ `v-model`（触发校验）+ `getUploadFiles('res')`（提交取值），`defaultFiles` 必须深拷贝赋值避免与 `v-model` 同引用
- 每个页面底部定义统一的 `init()` 函数作为初始化入口并立即调用
- api 文件使用 `const api = { ... }` 对象字面量 + JSDoc 注释风格

## 页面模式

| 模式 | 核心组件 | 参考 |
|------|----------|------|
| 列表页 | `EzTable` + `useTable` + 搜索区 | [example-page-list](references/example-page-list.md) |
| 详情页 | `EzDescriptions` + `fields` + `assignArrayByKey` | [example-page-detail](references/example-page-detail.md) |
| 表单页 | `el-form` + `EzDescriptions`(布局) + `EzUpload` | [example-page-form](references/example-page-form.md) |

## 组件 API

| 组件 | 说明 | 参考 |
|------|------|------|
| `EzTable` | 表格 + 分页 + 行内编辑 | [easyel.md](references/easyel.md) |
| `EzDescriptions` | 详情面板 / 表单布局容器 | [easyel.md](references/easyel.md) |
| `EzUpload` | 文件上传（预览、回显） | [easyel.md](references/easyel.md) |
| `EzConfigProvider` | 全局配置注入 | [easyel.md](references/easyel.md) |
| `EzFilePreview` / `EzVideo` / `EzViewer` | 文件/图片/视频预览 | [easyel.md](references/easyel.md) |

## 工具包

| 包 | 常用 API | 参考 |
|----|----------|------|
| `@yxzn/filter` | `formatMoney`、`formatDate`、`dictTranslate`、`maskIdCard` | [toolkit.md](references/toolkit.md) |
| `@yxzn/validator` | `isPhone`、`isIdCard`、`isEmpty`、`createValidator` | [toolkit.md](references/toolkit.md) |
| `@yxzn/utils` | `assignArrayByKey`、`mergeArrayItems`、`assignObject`、`debounce` | [toolkit.md](references/toolkit.md) |
| `@yxzn/calc` | `calc.add/subtract/multiply/divide/toFixed` | [toolkit.md](references/toolkit.md) |
| `@yxzn/directive` | `v-allow`（限制输入字符） | [toolkit.md](references/toolkit.md) |

## Quick Reference

### 类型定义（每个模块目录下的 .d.ts）

```ts
// ServicerModule.d.ts

export interface IServicerSearch {
  name?: string
  startTime?: number | ''
  endTime?: number | ''
}

export interface IServicerRow {
  id: string
  name: string
  contactPeople: string
  contactNumber: string
  createTime: number | ''
}

export interface IServicerForm {
  name: string
  contactPeople: string
  contactNumber: string
  licensePath: EzUploadResFile[]   // 上传文件 v-model 绑定
}

export interface IServicerDetail {
  id: string
  name: string
  contactPeople: string
  contactNumber: string
  createTime: number | ''
  licensePath: string[]            // 详情中图片为数组
}
```

### api 文件定义

```ts
const baseURL = import.meta.env.VITE_APP_BASE_API

const api = {
  /** @description 服务商 - 列表分页 */
  pageList: baseURL + '/servicer/pageList',
  /** @description 服务商 - 新增/编辑 */
  save: baseURL + '/servicer/save',
  /** @description 服务商 - 详情 */
  detail: baseURL + '/servicer/detail'
}

export default api
```

### 列表页骨架

> 完整示例见 [example-page-list.md](references/example-page-list.md)

```vue
<script setup lang="ts">
import { reactive } from 'vue'
import { useTable, useDate, type TableColumn } from '@yxzn/easyel'
import { formatDate, dictTranslate } from '@yxzn/filter'
import type { IServicerRow, IServicerSearch } from './ServicerModule.d'

const columns = reactive<TableColumn<IServicerRow>[]>([
  { label: '名称', prop: 'name', minWidth: 160 },
  { label: '创建时间', prop: 'createTime', minWidth: 160, filter: formatDate },          // 无额外参数：直接传引用
  { label: '状态', prop: 'status', minWidth: 100, filter: (v: any) => dictTranslate(v, statusDict.value) }, // 有额外参数：箭头函数包裹
  { label: '操作', prop: 'handle', fixed: 'right', minWidth: 120 }
])

const query = reactive<IServicerSearch>({ name: '', startTime: '', endTime: '' })
const tableState = useTable<IServicerRow, IServicerSearch>({
  query,
  requestConfig: { url: api.pageList, method: 'post' }
})
const createTimeRes = useDate(query, 'startTime', 'endTime')  // 时间范围

const search = () => tableState.search()
const handleReset = () => { createTimeRes.reset(); tableState.resetQuery(true) }

const init = () => tableState.search()
init()
</script>
```

### 详情页骨架

> 完整示例见 [example-page-detail.md](references/example-page-detail.md)

```vue
<script setup lang="ts">
import { ref, reactive } from 'vue'
import { type EzDescriptionsField } from '@yxzn/easyel'
import { assignArrayByKey } from '@yxzn/utils'
import { formatDate } from '@yxzn/filter'
import type { IServicerDetail } from './ServicerModule.d'

const detailData = ref<Partial<IServicerDetail>>({})

const basicFields = reactive<EzDescriptionsField<IServicerDetail>[]>([
  { prop: 'name', label: '名称', content: '' },
  { prop: 'createTime', label: '创建时间', content: '', filter: formatDate }
])
const attachFields = reactive<EzDescriptionsField<IServicerDetail>[]>([
  { prop: 'licensePath', label: '营业执照', content: [], isFile: true }
])

const fetchDetail = async () => {
  const res = await useAxios.get(api.detail, { params: { id } })
  detailData.value = res || {}
  detailData.value.licensePath = res.licensePath || []
  assignArrayByKey(basicFields, detailData.value)
  assignArrayByKey(attachFields, detailData.value)
}

const init = () => fetchDetail()
init()
</script>
```

### 表单页骨架

> 完整示例见 [example-page-form.md](references/example-page-form.md)

```vue
<script setup lang="ts">
import { ref, reactive, onActivated } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { EzUpload, type EzUploadDefaultFile, type EzUploadResFile } from '@yxzn/easyel'
import { assignObject } from '@yxzn/utils'
import { createValidator, isPhone, isNumeric } from '@yxzn/validator'
import type { IServicerForm } from './ServicerModule.d'

onActivated(() => init())

const formData = reactive<IServicerForm>({ name: '', licensePath: [] as EzUploadResFile[] })
const formRules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  phone: [{ message: '手机号格式不正确', trigger: 'blur', validator: createValidator(isPhone) }],          // 无额外参数
  price: [{ message: '请输入最多2位小数', trigger: 'blur', validator: createValidator(isNumeric, true, 2) }], // 有额外参数
  licensePath: [{ required: true, type: 'array', min: 1, message: '请上传', trigger: 'change' }]
}

const formRef = ref<FormInstance>()
const licenseFiles = ref<EzUploadDefaultFile>([])           // 回显（独立 ref，不与 v-model 同引用）
const licenseRef = ref<InstanceType<typeof EzUpload>>()     // 提交时 getUploadFiles

const fetchDetail = async () => {
  const res = await useAxios.get(api.detail, { params: { id } })
  assignObject(formData, res)
  licenseFiles.value = JSON.parse(JSON.stringify(res.licensePath ? [res.licensePath] : []))  // 深拷贝
}

const handleSave = () => {
  formRef.value!.validate(async (valid) => {
    if (!valid) return
    await useAxios.post(api.save, {
      ...formData,
      licensePath: licenseRef.value!.getUploadFiles('res').join(',')
    })
    ElMessage.success('操作成功')
    router.go(-1)
  })
}

const init = () => { if (isEdit) fetchDetail() }
init()
</script>
```
