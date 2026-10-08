# DUNE Catalog TODO List

## Reversions

- [x] Revert the SQLite-backed login session registry added in PR #17, including `SESSION_DB_PATH` and per-request session lookups. Keep signed-cookie authentication and FNAL logout cleanup. Retain the existing 24-hour cookie lifetime; after logout, a copied cookie remains valid until expiry.
- [x] Restore email-based administrator identification from before PR #16. Use email strings in `admins.json` and the Admin Users form/JSON editor, with case-insensitive matching against the signed-in user's email. Adding an admin requires only their email, without `issuer`/`sub` records or a prior sign-in. Keep CILogon sign-in.

## Current Tasks
- copy list of file names for a dataset
- Double check for Security measures in general
- Fix functionality of selecting the current state curated search to refill out the fields
- Create way to display the fields of the curated search
- More robust help button (tutorial?)
- Clean up console logs
- Clean up code in general

## Additional Suggested Improvements
- Create a dashboard for saved searches and recent queries
- Implement advanced search filters
- Create export functionality for search results (CSV, JSON)
- Implement caching mechanism for frequently accessed datasets
- Add performance monitoring and logging
- Develop a more comprehensive error handling system
- Add data visualization for dataset metadata
- Create a feedback mechanism for users
- Add keyboard navigation support
- Implement search history tracking
- Create a configuration management interface

## Performance Optimization
- Profile and optimize database queries
- Implement efficient pagination strategies
- Reduce unnecessary re-renders in React components
- Optimize API response times

## Security Enhancements
- Enhance authentication security
- Implement HTTPS and secure communication protocols

## Future Features
- Machine learning-based search recommendations
- Integration with external data sources
- Advanced analytics and reporting
