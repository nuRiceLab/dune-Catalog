import React, { useState } from 'react';
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast} from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import tabsConfig from '@/config/tabsConfig.json';

interface SearchBarProps {
  onSearch: (query: string, category: string, tab: string, officialOnly: boolean) => void;
  activeTab: string;
}

export function SearchBar({ onSearch, activeTab }: SearchBarProps) {
  const [officialOnly, setOfficialOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!category) {
      toast({
        variant: "destructive",
        title: "Category Required",
        description: "Please select a category before searching.",
      })
      return;
    }
    setIsLoading(true);
    try {
      await onSearch(query, category, activeTab, officialOnly);
    } catch (error) {
      console.error('Search failed:', error);
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: "An error occurred while searching. Please try again.",
      })
    } finally {
      setIsLoading(false);
    }
  };

  const getCategoryOptions = () => {
    return tabsConfig[activeTab]?.categories.map(cat => cat.name) || [];
  };

  return (
      <form onSubmit={handleSubmit} className="flex space-x-2">
        <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-grow"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select category"/>
          </SelectTrigger>
          <SelectContent>
            {getCategoryOptions().map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center space-x-2">
          <Switch
              id="official-switch"
              checked={officialOnly}
              onCheckedChange={setOfficialOnly}
          />
          <Label htmlFor="official-switch">Official</Label>
        </div>
        <Button
            type="submit"
            disabled={isLoading}
            className="relative"
        >
      <span className={`${isLoading ? 'invisible' : 'visible'}`}>
        Search
      </span>
          {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin"/>
              </div>
          )}
        </Button>
      </form>
  );
}