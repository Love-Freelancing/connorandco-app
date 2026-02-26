"use client";

import { Button } from "@connorco/ui/button";
import { Input } from "@connorco/ui/input";
import type { Table } from "@tanstack/react-table";
import { useCategoryParams } from "@/hooks/use-category-params";
import type { Category } from "./columns";

type Props = {
  table?: Table<Category>;
};

export function Header({ table }: Props) {
  const { setParams } = useCategoryParams();

  const handleCreateCategory = () => {
    setParams({ createCategory: true });
  };

  const meta = table?.options.meta as
    | { searchValue?: string; setSearchValue?: (value: string) => void }
    | undefined;

  const searchValue = meta?.searchValue ?? "";
  const setSearchValue = meta?.setSearchValue;

  return (
    <div className="flex items-center py-4 justify-between">
      <Input
        placeholder="Search..."
        value={searchValue}
        onChange={(event) => setSearchValue?.(event.target.value)}
        className="max-w-sm"
      />

      <Button onClick={handleCreateCategory}>Create</Button>
    </div>
  );
}
