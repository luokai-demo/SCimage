import { createApp } from "vue";
import { createPinia } from "pinia";
import ScimageApp from "./components/ScimageApp.vue";

createApp(ScimageApp)
  .use(createPinia())
  .mount("#app");
