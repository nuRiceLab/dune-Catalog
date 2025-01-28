import config from '@/config/config.json';

export function Footer() {
  return (
      <footer className="text-center p-4 bg-headfoot-background transition-colors duration-200">
          <p>Last updated: {config.app.info.lastUpdated}</p>
          <a href="https://www.dunescience.org" className="text-blue-500 hover:underline">DUNE Homepage</a>
      </footer>
  )
}
