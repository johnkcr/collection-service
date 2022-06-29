import Firebase from './database/Firebase';
import { container, delay } from 'tsyringe';
import MetadataClient from './services/Metadata';
import TokenDao from './dao/Token.dao';
import CollectionDao from './dao/Collection.dao';
import CollectionService from './models/CollectionService';
import Moralis from './services/Moralis';
import OpenSeaClient from './services/OpenSea';
import Logger from './utils/Logger';
import Providers from './models/Providers';
import Alchemy from './services/Alchemy';
import MnemonicClient from './services/Mnemonic';

export const logger: Logger = container.resolve(Logger);
export const providers: Providers = container.resolve(Providers);

export const firebase: Firebase = container.resolve(Firebase);
export const metadataClient: MetadataClient = container.resolve(MetadataClient);
export const tokenDao: TokenDao = container.resolve(TokenDao);
export const collectionDao: CollectionDao = container.resolve(CollectionDao);
export const collectionService: CollectionService = container.resolve(delay(() => CollectionService));
export const moralis: Moralis = container.resolve(Moralis);
export const opensea: OpenSeaClient = container.resolve(OpenSeaClient);
export const mnemonic: MnemonicClient = container.resolve(MnemonicClient);
export const alchemy: Alchemy = container.resolve(Alchemy);
