# ============================================================
#  RetroGTA3 — Makefile
#
#  每个 target 都是一个可独立执行的任务：
#      make gen          生成素材
#      make mission MISSION=portland-01   跑/查单个游戏任务
#
#  完整列表： make help
# ============================================================

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help
.DELETE_ON_ERROR:
MAKEFLAGS += --no-print-directory

NODE := node
NPM  := npm

GEN_DIR    := public/assets/proc
DOC_DIR    := docs
SHOT_DIR   := .shots
MISSION_DIR := content/missions

# ============================================================
#  帮助
# ============================================================

help: ## 显示所有可用任务
	@printf "\n  \033[1mRetroGTA3\033[0m — 可用任务\n"
	@printf "  \033[36m%-20s\033[0m %s\n" "TASK" "DESCRIPTION"
	@grep -E '^[a-zA-Z][a-zA-Z0-9_-]*:.*?## .*$$' $(MAKEFILE_LIST) \
		| sed -n 's/^\([a-zA-Z][a-zA-Z0-9_-]*\):.*## \(.*\)$$/\1|\2/p' \
		| sort \
		| awk -F'|' '{printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@printf "\n  示例\n"
	@printf "    \033[36mmake setup\033[0m                      新机器第一步：装依赖+生成素材\n"
	@printf "    \033[36mmake doctor\033[0m                     检查本机环境\n"
	@printf "    \033[36mmake gen\033[0m                        生成程序化素材（瓦片/建筑/道具）+ 拷烘焙产物\n"
	@printf "    \033[36mmake bake\033[0m                       烘焙角色：CC0 低模 → 8 方向精灵图\n"
	@printf "    \033[36mmake bake-vehicles\033[0m              烘焙载具：CC0 车模 → 20 款车 × 32 方向精灵图\n"
	@printf "    \033[36mmake shot\033[0m                       截图自检：改完玩法代码自己看画面\n"
	@printf "    \033[36mmake mission MISSION=portland-01\033[0m  查看单个游戏任务\n"
	@printf "    \033[36mmake check\033[0m                      跑完整自检（类型+单测+烘焙+素材+截图）\n"
	@printf "\n"

# ============================================================
#  环境
# ============================================================

doctor: ## 检查本机环境是否满足要求
	@printf "\n  环境自检\n  ─────────────────────────────\n"
	@printf "  node    "; $(NODE) -v 2>/dev/null || printf "\033[31m缺失 ✗\033[0m\n"
	@printf "          "; $(NODE) -e "const v=process.versions.node.split('.').map(Number); if(v[0]>22||(v[0]===22&&v[1]>=18)){console.log('\033[32m版本 OK（脚本用 Node 原生 TS 裁剪，需要 >=22.18）\033[0m')}else{console.log('\033[31m版本过低，需要 >=22.18\033[0m')}"
	@printf "  npm     "; $(NPM) -v 2>/dev/null || printf "\033[31m缺失 ✗\033[0m\n"
	@printf "  make    "; make -v 2>/dev/null | head -1 || printf "\033[31m缺失 ✗\033[0m\n"
	@printf "  canvas  "; $(NODE) -e "require('@napi-rs/canvas')" 2>/dev/null && printf "已安装 ✓\n" || printf "\033[31m未安装（先跑 make install）✗\033[0m\n"
	@printf "  playwright 包   "; [ -d node_modules/playwright ] && printf "已安装 ✓\n" || printf "\033[33m未安装（Phase 0 需要）\033[0m\n"
	@printf "  chromium 浏览器 "; $(NODE) -e "const {chromium}=require('playwright');console.log(chromium.executablePath())" 2>/dev/null | { read p || p=""; if [ -n "$$p" ] && [ -f "$$p" ]; then printf "已安装 ✓\n"; else printf "\033[33m缺失 ✗ —— 跑 npx playwright install chromium\033[0m\n"; fi; } || printf "\033[33m未安装 ✗ —— 跑 npx playwright install chromium\033[0m\n"
	@printf "\n"

install: ## 安装依赖（含 Playwright 的 Chromium：烘焙/截图都要用）
	@$(NPM) install
	@$(NPM) exec -- playwright install chromium
	@printf "\n  \033[32m✓\033[0m 依赖已安装（含 Chromium）\n"

setup: install gen ## 新机器第一步：装依赖 + 生成素材（首次拉取仓库后跑这个）

# ============================================================
#  素材
# ============================================================

gen: ## 生成程序化素材（瓦片/建筑/道具）+ 拷贝烘焙产物
	@$(NPM) run gen

gen-zoom: ## 把瓦片/道具 PNG 拼成放大核对图到 docs/
	@$(NODE) scripts/dev/zoom-sprites.ts $(GEN_DIR)/tiles 3 $(DOC_DIR)/preview-tiles.png
	@$(NODE) scripts/dev/zoom-sprites.ts $(GEN_DIR)/props 3 $(DOC_DIR)/preview-props.png

assets: gen gen-zoom ## 生成素材 + 放大核对图

preview-characters: ## 生成角色素材预览图到 docs/（8 方向 × 8 帧 + NPC 对比）
	@$(NODE) scripts/dev/preview-characters.ts $(DOC_DIR)/preview-characters.png

preview-vehicles: ## 生成载具素材预览图到 docs/（20 款车 × 4 正交方向）
	@$(NODE) scripts/dev/preview-vehicles.ts $(DOC_DIR)/preview-cars.png

preview-district: ## 生成街区布局核对图到 tmp/（路网/地块/建筑朝向）
	@$(NODE) scripts/dev/preview-district.ts tmp/district-preview.png

bake: ## 烘焙角色：CC0 低模 → 8 方向精灵图（含 NPC 换色变体）
	@$(NODE) tools/bake/bake.ts --pitch 60 --cell 96

bake-check: ## 只检查角色烘焙产物有没有被裁切
	@$(NODE) tools/bake/bake.ts --pitch 60 --cell 96 --out tmp/bake-check

bake-vehicles: ## 烘焙载具：CC0 车模 → 20 款车 × 32 方向精灵图（自带裁切 + 朝向自检）
	@$(NODE) tools/bake/bake-vehicles.ts

bake-vehicles-check: ## 只跑车辆烘焙自检（不覆盖正式产物）
	@$(NODE) tools/bake/bake-vehicles.ts --out tmp/bake-vehicles-check

# ============================================================
#  游戏内任务（mission）
# ============================================================

missions: ## 列出所有任务定义
	@$(NODE) scripts/dev/missions.ts list

MISSION ?=
mission: ## 查看/校验单个任务（用法：make mission MISSION=portland-01）
	@if [ -z "$(MISSION)" ]; then \
		printf "\n  \033[33m用法:\033[0m make mission MISSION=<任务id>\n\n"; \
		$(NODE) scripts/dev/missions.ts list; \
		exit 1; \
	fi
	@$(NODE) scripts/dev/missions.ts show "$(MISSION)"

mission-validate: ## 校验全部任务定义（CI 用）
	@$(NODE) scripts/dev/missions.ts validate

# ============================================================
#  开发与构建
# ============================================================

dev: ## 启动开发服务器（自动先生成素材）
	@$(NPM) run dev

build: ## 构建生产包（自动先生成素材）
	@$(NPM) run build

preview: ## 本地预览生产构建
	@$(NPM) run preview

test: ## 运行单元测试
	@$(NPM) run test

test-watch: ## 单元测试 watch 模式
	@$(NPM) run test:watch

shot: ## 截图自检（AI 开发闭环：改完代码自己看画面）
	@$(NPM) run shot

typecheck: ## TypeScript 类型检查
	@if [ ! -x node_modules/.bin/tsc ]; then \
		printf "\n  \033[33m⟳\033[0m 跳过：typescript 未安装（Phase 0 之后可用）\n\n"; \
	else \
		node_modules/.bin/tsc --noEmit && printf "\n  \033[32m✓\033[0m 类型检查通过\n\n"; \
	fi

lint: ## 代码风格检查
	@if [ ! -x node_modules/.bin/eslint ]; then \
		printf "\n  \033[33m⟳\033[0m 跳过：eslint 未安装（Phase 0 之后可用）\n\n"; \
	else \
		node_modules/.bin/eslint src scripts --ext .ts; \
	fi

check: typecheck mission-validate test bake bake-vehicles-check gen shot ## 完整自检：类型 + 任务数据 + 单测 + 角色/车辆烘焙 + 素材 + 截图

# ============================================================
#  清理
# ============================================================

clean: ## 删除生成产物（素材 / 截图 / 构建）
	@rm -rf $(GEN_DIR) $(SHOT_DIR) dist .vite
	@printf "\n  \033[32m✓\033[0m 已清理生成产物\n\n"

clean-all: clean ## 连同 node_modules 一起删除
	@rm -rf node_modules
	@printf "\n  \033[32m✓\033[0m 已删除 node_modules\n\n"

.PHONY: help doctor install setup gen gen-zoom assets bake bake-check \
        bake-vehicles bake-vehicles-check preview-characters preview-vehicles preview-district \
        missions mission mission-validate \
        dev build preview test test-watch shot typecheck lint check \
        clean clean-all
