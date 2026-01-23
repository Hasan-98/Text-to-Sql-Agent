import readline from "readline";
import chalk from "chalk";
import { conversationContext } from "../context/ConversationContext.js";
import { app } from "../agents/workflow.js";

export class ChatInterface {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.cyan('\n You: ')
        });
        this.isProcessing = false;
    }

    printWelcome() {
        console.clear();
        console.log(chalk.bold.green('\n╔════════════════════════════════════════════════════════════════════╗'));
        console.log(chalk.bold.green('║    AI Retail Analytics Chat (Enhanced Self-Correcting Mode)     ║'));
        console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════════════╝'));
        console.log(chalk.yellow('\nAsk questions about store performance - I\'ll validate and correct myself!'));
        console.log(chalk.gray('\nCommands:'));
        console.log(chalk.gray('  /help     - Show example queries'));
        console.log(chalk.gray('  /clear    - Clear conversation history'));
        console.log(chalk.gray('  /stats    - Show conversation statistics'));
        console.log(chalk.gray('  /schema   - Show database schema'));
        console.log(chalk.gray('  /exit     - Exit the chat'));
        console.log(chalk.gray('\n' + '─'.repeat(70)));
    }

    printHelp() {
        console.log(chalk.yellow('\nExample Queries:\n'));

        console.log(chalk.cyan('Basic Queries:'));
        console.log('  • "Show top 10 stores by revenue"');
        console.log('  • "Which stores have the lowest order count?"');
        console.log('  • "Bottom 20 branches by orders in last 3 months"');

        console.log(chalk.cyan('\nFiltered Queries:'));
        console.log('  • "Show mall stores with profit below 5%"');
        console.log('  • "Which Istanbul stores have worst ratings?"');

        console.log(chalk.cyan('\nFollow-up Queries (uses context):'));
        console.log('  • "What are their audit scores?"');
        console.log('  • "How much time did managers spend there?"');
        console.log('  • "Compare these to average"');

        console.log(chalk.cyan('\nAnalysis Queries:'));
        console.log('  • "Why are these stores underperforming?"');
        console.log('  • "What should we do about the worst stores?"');
        console.log('  • "Analyze the efficiency of bottom performers"');
    }

    printSchema() {
        console.log(chalk.yellow('\nDatabase Schema Summary:\n'));
        console.log(chalk.cyan('Table: store_metrics'));
        console.log(chalk.gray('\nKey Columns:'));
        console.log('  • store_name, store_type, store_city');
        console.log('  • month, year, order_month (COUNT of orders)');
        console.log('  • net_revenue_tl_month, store_profit_tl_month');
        console.log('  • store_audit_score, online_rating_score');
        console.log('  • active_headcount, store_size_m2');
        console.log(chalk.gray('\nTime Range: Multiple years available'));
    }

    printStats() {
        console.log(chalk.yellow('\nConversation Statistics:'));
        console.log(`   Queries asked: ${conversationContext.history.length}`);
        console.log(`   Stores discussed: ${conversationContext.entities.recentStores?.length || 0}`);
        console.log(`   Metrics tracked: ${conversationContext.entities.discussedMetrics?.length || 0}`);

        if (conversationContext.entities.discussedMetrics?.length > 0) {
            console.log(`   Topics: ${conversationContext.entities.discussedMetrics.join(', ')}`);
        }

        if (conversationContext.entities.recentStores?.length > 0) {
            console.log(`   Recent stores: ${conversationContext.entities.recentStores.slice(0, 5).map(s => s.name).join(', ')}...`);
        }
    }

    async processQuery(query) {
        if (this.isProcessing) {
            console.log(chalk.red('\n⏳ Please wait for the current query to complete...'));
            return;
        }

        if (query.startsWith('/')) {
            this.handleCommand(query);
            return;
        }

        if (!query.trim()) {
            this.rl.prompt();
            return;
        }

        this.isProcessing = true;

        try {
            const startTime = Date.now();

            // Ensure we have the latest session state
            conversationContext.load();

            const result = await app.invoke({
                userQuery: query,
                correctionAttempts: 0
            }, { recursionLimit: 50 });
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);

            if (result.error && !result.queryResult) {
                console.log(chalk.red(`\nError: ${result.error}`));
            } else {
                // Show main answer
                console.log(chalk.green('\n🤖 Assistant:\n'));
                console.log(this.formatAnswer(result.finalAnswer));

                // Show KPI status if available
                if (result.kpiAnalysis) {
                    const statusEmoji = {
                        'Critical': '🔴',
                        'Warning': '🟡',
                        'Good': '🟢',
                        'Excellent': '🌟'
                    };
                    console.log(chalk.yellow(`\n${statusEmoji[result.kpiAnalysis.healthStatus] || '⚪'} KPI Status: ${result.kpiAnalysis.healthStatus} (${result.kpiAnalysis.overallScore}/100)`));
                }

                // Show tasks summary if available
                if (result.generatedTasks?.tasks?.length > 0) {
                    console.log(chalk.yellow(`\n${result.generatedTasks.summary.totalTasks} Action Tasks Generated`));
                    console.log(chalk.gray(`   High priority: ${result.generatedTasks.summary.highPriority}`));
                }

                // Show data table
                if (result.queryResult && result.queryResult.length > 0) {
                    console.log(chalk.gray(`\nData Preview (${result.queryResult.length} total rows):`));

                    // Show up to 20 rows, or all if less than 20
                    const displayLimit = Math.min(result.queryResult.length, 20);
                    console.table(result.queryResult.slice(0, displayLimit));

                    if (result.queryResult.length > displayLimit) {
                        console.log(chalk.gray(`   ... ${result.queryResult.length - displayLimit} more rows (data is complete, showing preview)`));
                    }
                }

                // Show correction info
                if (result.correctionAttempts > 1) {
                    console.log(chalk.cyan(`\nQuery was self-corrected ${result.correctionAttempts - 1} time(s)`));
                }
            }

            console.log(chalk.gray(`\nCompleted in ${duration}s`));

        } catch (error) {
            console.log(chalk.red(`\nSystem Error: ${error.message}`));
            console.log(chalk.gray(error.stack));
        } finally {
            this.isProcessing = false;
            this.rl.prompt();
        }
    }

    formatAnswer(answer) {
        return answer
            .replace(/\*\*(.*?)\*\*/g, chalk.bold('$1'))
            .replace(/• /g, chalk.cyan('• '))
            .replace(/\n- /g, '\n' + chalk.cyan('• '));
    }

    handleCommand(command) {
        const cmd = command.toLowerCase().trim();

        switch (cmd) {
            case '/help':
                this.printHelp();
                break;

            case '/clear':
                conversationContext.clear();
                console.log(chalk.green('\n Conversation history cleared!'));
                break;

            case '/stats':
                this.printStats();
                break;

            case '/schema':
                this.printSchema();
                break;

            case '/exit':
            case '/quit':
                console.log(chalk.yellow('\n Thanks for using AI Retail Analytics! Goodbye!\n'));
                this.rl.close();
                process.exit(0);
                break;

            default:
                console.log(chalk.red(`\n Unknown command: ${command}`));
                console.log(chalk.gray('Type /help for available commands'));
        }

        this.rl.prompt();
    }

    start() {
        this.printWelcome();

        this.rl.on('line', async (input) => {
            await this.processQuery(input.trim());
        });

        this.rl.on('close', () => {
            console.log(chalk.yellow('\nGoodbye!\n'));
            process.exit(0);
        });

        this.rl.prompt();
    }
}
