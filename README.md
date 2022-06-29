# nft-collection-service

## Scripts
<!-- * `npm run serve` - starts the program in production mode (not yet implemented) -->
* `npm run dev` - runs `script.ts` for developing/testing flows
* `npm run cli` - start in cli mode. Example: `npm run cli -- address=0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D chain=1 task=create`
* `npm run cli-server` - start in cli mode with a heap size of 60GB
* `npm run queue` - starts a collection queue listener to scrape collections based off a db subscription 
## CLI 

* Tasks
    * `scrape` - scrapes collections from opensea and new collections to the db (saves the minimal amount of data for a collection)
        * Example command: `npm run cli -- task=scrape`
    * `create` - handles creating the specified collection (gets all data for the collection including all nfts)
        * Modes 
            * Address Mode 
                * `address` (required) - the address to run the task for 
                * `chain` (optional) - Base 10 chain id. Defaults to 1
                * `hasBlueCheck` (optional) - whether the collection is verified (defaults to false)
                * `reset` (optional) - if set to `true` the collection will be reset and all data will be collected
                * `task` (optional) - the type of task to run. Valid tasks include 
                    * `create` (default) - creates a collection
            * File Mode
                * `file` (required) - path the a file structured as    
                * `hasBlueCheck` (optional) - overrides hasBlueCheck for every item in the file
                * `reset` (optional) - if set to `true` all collections will be reset and all data will be collected
                ```ts
                [
                    { 
                        address: string, // (required)
                        chainId: string, // (optional) defaults to 1
                        hasBlueCheck: boolean // (optional) defaults to false
                    },
                    ...
                ]
                ```

