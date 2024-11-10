import { useState, useEffect } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronUp, ChevronDown } from 'lucide-react'

interface SearchBarProps {
  onSearch: (query: string, category: string, sortBy: string, sortOrder: 'asc' | 'desc') => void;
  activeTab: string;
}

export function SearchBar({ onSearch, activeTab }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    // Reset states when activeTab changes
    setQuery('');
    setCategory('');
    setSortBy('');
    setSortOrder('asc');

    switch (activeTab) {
      case 'Far Detectors':
        setCategoryOptions(['FD-HD', 'FD-VD']);
        break;
      case 'Protodune-HD':
      case 'ProtoDune-VD':
        setCategoryOptions(['MC', 'Data']);
        break;
      case 'Near Detector Prototypes':
        setCategoryOptions(['M 2x2 MC', 'M 2x2 Data', 'Others']);
        break;
      default:
        setCategoryOptions([]);
    }
  }, [activeTab]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSearch(query, category, sortBy, sortOrder);
  };

  const toggleSortOrder = () => {
    setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 mb-4">
      <div className="flex-grow flex items-center gap-2">
        <Input
          type="text"
          placeholder="Search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-grow"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select Category" />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="updated">Date</SelectItem>
            <SelectItem value="size">Size</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="icon" onClick={toggleSortOrder}>
          {sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>
      <Button type="submit">Search</Button>
    </form>
  );
}