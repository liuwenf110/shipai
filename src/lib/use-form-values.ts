"use client";

import { useState } from "react";

type FieldChange = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;

/**
 * 受控表单值：Server Action 结束后 React 会执行 form.reset()，非受控输入会被清空。
 * 把字段挂成受控值，提交失败时就能保留用户已填内容，方便原地修改后重提。
 */
export function useFormValues<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState<T>(initial);

  function set<K extends keyof T & string>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }) as T);
  }

  /** 文本类字段：<input {...form.field("name")} /> */
  function field<K extends keyof T & string>(key: K) {
    return {
      name: key,
      value: values[key],
      onChange: (event: FieldChange) => set(key, event.target.value),
    };
  }

  /** 勾选框：受控 checked 在 reset 后不会恢复，故用 defaultChecked + onChange 同步状态 */
  function toggle<K extends keyof T & string>(key: K) {
    return {
      name: key,
      defaultChecked: values[key] === "true",
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        set(key, event.target.checked ? "true" : ""),
    };
  }

  /** 单选项：同样用 defaultChecked 记住当前选择，reset 后不会被退回第一项 */
  function choice<K extends keyof T & string>(key: K, value: string) {
    return {
      name: key,
      value,
      defaultChecked: values[key] === value,
      onChange: () => set(key, value),
    };
  }

  return { values, set, field, toggle, choice };
}
