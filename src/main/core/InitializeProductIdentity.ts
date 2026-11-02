import {initializeProductIdentity} from './ProductIdentity';

// 在加载包含 profile 级单例的应用模块之前固定身份。
initializeProductIdentity();
