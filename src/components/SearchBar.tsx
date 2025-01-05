import React, { useState, useEffect, useRef } from 'react';
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
import searchConfigs from '@/config/searchConfigs.json';
import { isLoggedIn } from '@/lib/auth';

interface SearchBarProps {
  onSearch: (query: string, category: string, tab: string, officialOnly: boolean) => void;
  activeTab: string;
  onTabChange?: (tab: string) => void;
}

export function SearchBar({ onSearch, activeTab, onTabChange }: SearchBarProps) {
  const [officialOnly, setOfficialOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownTime, setCooldownTime] = useState(0);
  const cooldownInterval = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (cooldownInterval.current) {
        clearInterval(cooldownInterval.current);
      }
    };
  }, []);

  // Reset category when tab changes
  useEffect(() => {
    setCategory('');
  }, [activeTab]);

  const startCooldown = () => {
    setCooldownTime(5); // 5 second cooldown
    cooldownInterval.current = setInterval(() => {
      setCooldownTime((prev) => {
        if (prev <= 1) {
          if (cooldownInterval.current) {
            clearInterval(cooldownInterval.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (cooldownTime > 0) {
      toast({
        variant: "destructive",
        title: "Search Rate Limited",
        description: `Please wait ${cooldownTime} seconds before searching again.`,
      });
      return;
    }

    if (!isLoggedIn()) {
      toast({
        variant: "destructive",
        title: "Authentication Required",
        description: "Please sign in to perform searches.",
      });
      return;
    }

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
      // Start cooldown after successful search
      startCooldown();
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

  const handleSavedSearchSelect = (searchName: string) => {
    const savedSearch = searchConfigs.savedSearches.find(s => s.name === searchName);
    if (savedSearch) {
      // First, set all the form values
      setQuery(savedSearch.query);
      setCategory(savedSearch.category);
      setOfficialOnly(savedSearch.officialOnly);

      // Then, if needed, change the tab
      if (savedSearch.tab !== activeTab && onTabChange) {
        onTabChange(savedSearch.tab);
      }
    }
  };

  const getCategoryOptions = () => {
    return tabsConfig[activeTab]?.categories.map(cat => cat.name) || [];
  };

  return (
    <div className="space-y-4">
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
      
      <div className="flex space-x-2 items-center">
        <Label className="text-sm text-muted-foreground">Curated Searches:</Label>
        <Select onValueChange={handleSavedSearchSelect}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select a curated search"/>
          </SelectTrigger>
          <SelectContent>
            {searchConfigs.savedSearches.map((search) => (
              <SelectItem key={search.name} value={search.name}>
                <span className="flex items-center gap-2">
                  {search.name}
                  <span className="text-xs text-muted-foreground">({search.tab})</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}