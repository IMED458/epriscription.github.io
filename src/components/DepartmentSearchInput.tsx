import React from "react";
import { DEPARTMENT_OPTIONS } from "../lib/departments";

type DepartmentSearchInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "list"> & {
  listId: string;
};

export function DepartmentSearchInput({ listId, type, autoComplete, ...props }: DepartmentSearchInputProps) {
  return (
    <input
      {...props}
      type={type || "text"}
      list={listId}
      autoComplete={autoComplete || "off"}
    />
  );
}

export function DepartmentDatalist({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {DEPARTMENT_OPTIONS.map((department) => (
        <option key={department} value={department} />
      ))}
    </datalist>
  );
}
