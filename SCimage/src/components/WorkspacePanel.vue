<template>
  <div class="panel" id="workspacePanel">
    <div class="panel-inner">
      <div class="panel-header">
        <div class="panel-header-copy">
          <h1>SCimage</h1>
        </div>
        <IconButton id="panelToggleBtn" class-name="panel-toggle" label="收起左侧工作区">
          <ChevronLeft aria-hidden="true" />
        </IconButton>
      </div>

      <div class="panel-body">
        <details class="connection-card" id="providerConfigCard">
          <summary>提供方配置</summary>
          <div class="connection-card-body">
            <div class="provider-config-stack">
              <div class="provider-config-cluster">
                <div class="form-group provider-config-field">
                  <div class="field-label-row">
                    <label for="providerProfileSelect">快速切换</label>
                    <span class="field-meta-text">当前配置</span>
                  </div>
                  <div class="provider-profile-picker">
                    <button
                      type="button"
                      id="providerProfileSelect"
                      class="provider-profile-trigger is-empty"
                      aria-haspopup="listbox"
                      aria-expanded="false"
                      aria-controls="providerProfileMenu"
                    >未保存任何配置</button>
                    <div id="providerProfileMenu" class="provider-profile-menu" role="listbox" hidden></div>
                  </div>
                </div>
                <div class="form-group provider-config-field">
                  <div class="field-label-row">
                    <label for="providerProfileName">配置名称</label>
                    <span class="field-meta-text">保存 / 另存为</span>
                  </div>
                  <input type="text" id="providerProfileName" placeholder="当前提供方 / 备用节点">
                </div>
              </div>

              <div class="provider-config-cluster">
                <div class="form-group provider-config-field">
                  <div class="field-label-row">
                    <label for="baseUrl">Base URL</label>
                    <span class="field-meta-text">OpenAI-compatible</span>
                  </div>
                  <input type="text" id="baseUrl" placeholder="https://api.openai.com/v1">
                </div>
                <div class="form-group provider-config-field">
                  <div class="field-label-row">
                    <label for="apiKey">API Key</label>
                    <span class="field-meta-text">留空沿用已保存密钥</span>
                  </div>
                  <div class="input-with-action">
                    <input type="password" id="apiKey" placeholder="输入新 API Key">
                    <IconButton id="toggleApiKeyVisibilityBtn" class-name="input-action-btn" label="显示 API Key">
                      <Eye aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
              </div>

              <div class="provider-config-cluster provider-option-stack">
                <UiSelectField select-id="model" label="模型" aria-describedby="modelStatusHint" label-action>
                  <template #label-action>
                    <IconButton id="modelReloadBtn" class-name="field-label-icon-btn" label="拉取模型">
                      <RefreshCw aria-hidden="true" />
                    </IconButton>
                  </template>
                  <option value="" selected disabled>请选择 API 支持的模型</option>
                  <template #after>
                    <div id="modelStatusHint" class="field-hint" aria-live="polite"></div>
                  </template>
                </UiSelectField>

                <div class="form-group">
                  <label class="checkbox-field" for="supportsCountParameter">
                    <span class="checkbox-field-copy">
                      <span class="checkbox-field-title">上游支持传递生成张数</span>
                    </span>
                    <span class="checkbox-switch">
                      <input type="checkbox" id="supportsCountParameter" checked>
                      <span class="checkbox-switch-ui" aria-hidden="true"></span>
                    </span>
                  </label>
                </div>

                <UiSelectField select-id="providerCompatProfile" label="兼容模式" meta="上游协议" class-name="provider-config-field" />
              </div>

              <div class="button-row button-row-tight">
                <button type="button" id="saveProviderBtn" class="btn-secondary">保存当前配置</button>
                <button type="button" id="saveAsProviderBtn" class="btn-secondary">另存为新配置</button>
              </div>
            </div>
          </div>
        </details>

        <section class="workspace-shell" aria-labelledby="workspaceTitle">
          <div class="workflow-tabs" id="workflowTabs" role="tablist" aria-label="工作流切换">
            <button type="button" class="workflow-tab active" data-workflow="generate" role="tab" aria-selected="true">文生图</button>
            <button type="button" class="workflow-tab" data-workflow="image-to-image" role="tab" aria-selected="false">图生图</button>
          </div>

          <section class="workspace-card">
            <div class="workspace-card-head">
              <div class="workspace-card-copy">
                <div class="workspace-eyebrow">左侧工作区</div>
                <h2 id="workspaceTitle" class="workspace-title">文生图</h2>
              </div>
              <span id="workspaceModeChip" class="workspace-chip is-live">已接入</span>
            </div>

            <div class="workspace-stack">
              <section class="workspace-group mode-hidden" data-workflow-scope="image-to-image">
                <div class="workspace-group-head">
                  <div>
                    <div id="sourceTitle" class="workspace-group-title">参考图</div>
                    <div id="sourceHint" class="workspace-group-hint">支持拖拽、粘贴或选择多张图片作为参考。</div>
                  </div>
                </div>
                <div class="drop-zone" id="sourceDropZone" tabindex="0" aria-label="参考图上传区域">
                  <div class="drop-zone-text" id="sourceDropText">将多张参考图拖到这里，或粘贴到工作区</div>
                  <div class="drop-zone-preview" id="sourcePreview"></div>
                  <input type="file" id="sourceImage" accept="image/*" multiple style="display:none;">
                  <button type="button" class="drop-zone-browse" id="sourceBrowseBtn">选择多张参考图</button>
                </div>
              </section>

              <section class="workspace-group">
                <div class="workspace-group-head">
                  <div>
                    <div class="workspace-group-title">提示词</div>
                    <div id="promptSectionHint" class="workspace-group-hint">直接描述你想生成的画面、风格和细节。</div>
                  </div>
                  <button type="button" id="togglePromptBankBtn" class="chip-btn" aria-expanded="false">词库</button>
                </div>
                <textarea id="prompt" placeholder="一只在星空下奔跑的白色柴犬，水彩风格"></textarea>

                <details class="inline-drawer" id="promptBankPanel">
                  <summary>
                    <span>已保存提示词</span>
                    <span id="promptBankCount" class="workspace-inline-hint">0 条</span>
                  </summary>
                  <div class="inline-drawer-body">
                    <div class="button-row compact">
                      <button type="button" id="savePromptBtn" class="btn-secondary">保存当前提示词</button>
                      <button type="button" id="clearPromptBankBtn" class="btn-secondary">清空词库</button>
                    </div>
                    <PromptBankPanel />
                  </div>
                </details>
              </section>

              <section class="workspace-group">
                <div class="workspace-group-head">
                  <div>
                    <div class="workspace-group-title">输出参数</div>
                    <div class="workspace-group-hint">当前工作流独立保存这一组输出参数，尺寸使用标准像素预设。</div>
                  </div>
                </div>
                <div class="row">
                  <UiSelectField select-id="size" label="尺寸" />
                  <UiSelectField select-id="quality" label="质量" />
                </div>
                <div class="row">
                  <UiSelectField select-id="count" label="数量">
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                  </UiSelectField>
                  <div class="form-group">
                    <label>输出格式</label>
                    <div class="helper-note">当前固定输出 PNG，格式与压缩选项后续再开放。</div>
                  </div>
                </div>
              </section>

              <section class="workspace-group">
                <div class="workspace-group-head">
                  <div class="workspace-group-title">执行</div>
                </div>
                <div id="status" class="status"></div>
                <div class="button-row">
                  <button type="button" id="generateBtn" class="btn-primary">生成图片</button>
                </div>
              </section>
            </div>
          </section>

          <TaskPanel />
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, Eye, RefreshCw } from "lucide-vue-next";
import IconButton from "./ui/IconButton.vue";
import PromptBankPanel from "./PromptBankPanel.vue";
import TaskPanel from "./jobs/TaskPanel.vue";
import UiSelectField from "./ui/UiSelectField.vue";
</script>
