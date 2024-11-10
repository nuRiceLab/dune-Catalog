'use client'
import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { SearchBar } from '@/components/SearchBar'
import { ResultsTable } from '@/components/ResultsTable'
import { searchData, Result } from '@/lib/api'

const tabs = [
  'Far Detectors',
  'Protodune-HD',
  'ProtoDune-VD',
  'Near Detector Prototypes'
]

export default function Home() {
  const [activeTab, setActiveTab] = useState(tabs[0])
  const [results, setResults] = useState<Result[]>([])
  const [hasSearched, setHasSearched] = useState(false)

  useEffect(() => {
    // Clear results and reset search state when tab changes
    setResults([])
    setHasSearched(false)
  }, [activeTab])

  const handleSearch = async (query: string, category: string, sortBy: string, sortOrder: 'asc' | 'desc') => {
    const data = await searchData(activeTab, query, category, sortBy, sortOrder)
    setResults(data)
    setHasSearched(true)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Tabs defaultValue={tabs[0]} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start">
              {tabs.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="flex-1">
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-6">
                <SearchBar onSearch={handleSearch} activeTab={activeTab} />
                {hasSearched ? (
                  <ResultsTable results={results} />
                ) : (
                  <div className="text-center text-gray-500 mt-8">
                    Please input one or more search criteria
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  )
}