import { createApp } from "vue";
import { createPinia } from "pinia";
import ScimageApp from "./components/ScimageApp.vue";
import "./styles/app.css";

createApp(ScimageApp)
  .use(createPinia())
  .mount("#app");
