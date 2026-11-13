import { Alert, AppShell, Button, Code, Group, Stack, Text } from '@mantine/core'
import { Component, type ReactNode } from 'react'
import { clearModuleData } from '../lib/storage'
import type { ModuleId } from '../modules'

interface State {
  error: Error | null
}

/**
 * Erro inesperado num módulo: mostra a mensagem em vez de derrubar o app inteiro (tela preta).
 * O App recria este componente ao trocar de módulo, então os outros módulos continuam usáveis.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; module: ModuleId }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  clearAndReload = async () => {
    await clearModuleData(this.props.module)
    window.location.reload()
  }

  componentDidCatch(error: Error) {
    console.error('Erro no módulo:', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <AppShell.Main>
        <Stack maw={720}>
          <Alert color="red" variant="light" title="Este módulo encontrou um erro inesperado">
            <Stack gap="xs">
              <Text size="sm">
                Os outros módulos continuam funcionando. Se o erro se repetir, informe a mensagem abaixo.
              </Text>
              <Code block>{error.message}</Code>
              <Group>
                <Button size="xs" variant="default" onClick={() => this.setState({ error: null })}>
                  Tentar de novo
                </Button>
                <Button size="xs" variant="subtle" onClick={() => window.location.reload()}>
                  Recarregar a página
                </Button>
              </Group>
              <Text size="sm">
                Se o erro voltar ao recarregar, a causa pode estar nos dados que este módulo guardou no navegador.
              </Text>
              <Group>
                <Button size="xs" variant="default" onClick={this.clearAndReload}>
                  Limpar dados deste módulo
                </Button>
                <Text size="xs" c="dimmed">
                  Apaga resultados, seleção e parâmetros do módulo e recarrega. Locais e radares cadastrados ficam.
                </Text>
              </Group>
            </Stack>
          </Alert>
        </Stack>
      </AppShell.Main>
    )
  }
}
