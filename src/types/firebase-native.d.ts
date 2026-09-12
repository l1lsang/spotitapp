import 'firebase/auth';
declare module 'firebase/auth' {
  // Firebase exposes this at runtime under Metro's react-native condition,
  // but its top-level public declaration currently omits the native export.
  export function getReactNativePersistence(storage: {
    getItem(key:string):Promise<string|null>;
    setItem(key:string,value:string):Promise<void>;
    removeItem(key:string):Promise<void>;
  }): Persistence;
}
