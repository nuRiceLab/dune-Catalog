'use client'
import {useState, useEffect, useRef, useCallback} from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import  { Header }  from '@/components/Header'
import  { Footer }  from '@/components/Footer'
import { SearchBar } from '@/components/SearchBar'
import { DatasetTable } from '@/components/DatasetTable'
import { searchDataSets, Dataset } from '@/lib/api'
import tabsConfig from '@/config/tabsConfig.json';

const tabs = Object.keys(tabsConfig);

export default function Home() {
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [sliderStyle, setSliderStyle] = useState({ width: 0, left: 0 })
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])
  const [results, setResults] = useState<Dataset[]>([]);
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
  }, [activeTabIndex])

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

  const handleSearch = async (query: string, category: string, tab: string, officialOnly: boolean) => {
    try {
      const searchResults = await searchDataSets(query, category, tab, officialOnly);
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
      // Handle error (e.g., show error message to user)
    }
  };

  if (!isClient || !isLoaded) {
    return null; // or a loading spinner
  }


  return (
      <div className="min-h-screen flex flex-col">
        <Header/>
        <main className="flex-grow container mx-auto px-4 py-8">
          <div className="max-w-5xl mx-auto">
            <Tabs defaultValue={tabs[0]} onValueChange={(value) => setActiveTabIndex(tabs.indexOf(value))} className='w-full'>
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
                    <SearchBar onSearch={handleSearch} activeTab={tab} />
                        <DatasetTable results={results}/>
                  </TabsContent>
              ))}
            </Tabs>
          </div>
        </main>
        <Footer/>
      </div>
  )
}