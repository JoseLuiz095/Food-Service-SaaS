import {defineConfig} from '@playwright/test';
import base from './order-edit.config';
export default defineConfig({...base,testMatch:['quick-purchase.spec.ts'],outputDir:'./test-results/storefront-conversion'});
