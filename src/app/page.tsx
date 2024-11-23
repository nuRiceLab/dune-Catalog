'use client'
import {useState, useEffect, useRef, useLayoutEffect, useCallback} from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import  { Header }  from '@/components/Header'
import  { Footer }  from '@/components/Footer'
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
  const [activeTab, setActiveTab] = useState('Far Detectors')
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [sliderStyle, setSliderStyle] = useState({ width: 0, left: 0 })
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const setTabRef = useCallback((el: HTMLButtonElement | null, index: number) => {
    tabsRef.current[index] = el
  }, [])
  useEffect(() => {
    setIsClient(true)
    // Force a re-render after a short delay to ensure DOM is fully loaded
    setTimeout(() => setIsLoaded(true), 0)
  }, [])

  useEffect(() => {
    setResults([])
    setHasSearched(false)
  }, [activeTab])

  useEffect(() => {
    const updateSlider = () => {
      const activeTab = tabsRef.current[activeTabIndex]
      if (activeTab) {
        setSliderStyle({
          width: activeTab.offsetWidth,
          left: activeTab.offsetLeft,
        })
      }
    }

    updateSlider()
    window.addEventListener('resize', updateSlider)
    return () => window.removeEventListener('resize', updateSlider)
  }, [activeTabIndex, isLoaded])

  const handleSearch = async (query: string, category: string, sortBy: string, sortOrder: 'asc' | 'desc') => {
    const data = await searchData(activeTab, query, category, sortBy, sortOrder)
    setResults(data)
    setHasSearched(true)
  }

  if (!isClient || !isLoaded) {
    return null; // or a loading spinner
  }


  return (
      <div className="min-h-screen flex flex-col">
        <Header/>
        <main className="flex-grow container mx-auto px-4 py-8">
          <div className="max-w-5xl mx-auto">
            <Tabs
                defaultValue="Far Detectors"
                value={activeTab}
                onValueChange={(value) => {
                  setActiveTab(value)
                  setActiveTabIndex(tabs.indexOf(value))
                }}
                className="w-full"
            >
              <TabsList className="w-full justify-start bg-muted relative">
                <div
                    className="tab-slider absolute h-8 bg-background rounded-sm transition-all duration-300 ease-in-out"
                    style={{
                      width: `${sliderStyle.width}px`,
                      left: `${sliderStyle.left}px`,
                      top: '4px'
                    }}
                />
                {tabs.map((tab, index) => (
                    <TabsTrigger
                        key={tab}
                        value={tab}
                        ref={(el) => setTabRef(el, index)}
                        className="flex-1 z-10 px-3 py-1.5 text-muted-foreground data-[state=active]:text-foreground relative"
                    >
                      {tab}
                    </TabsTrigger>
                ))}
              </TabsList>
              {tabs.map((tab) => (
                  <TabsContent key={tab} value={tab} className="mt-6">
                    <SearchBar onSearch={handleSearch} activeTab={activeTab}/>
                    {hasSearched ? (
                        <ResultsTable results={results}/>
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
        <Footer/>
      </div>
  )
}