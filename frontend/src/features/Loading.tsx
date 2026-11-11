import { Center, Loader } from '@mantine/core'

export function Loading({ height = 400 }: { height?: number }) {
  return (
    <Center h={height}>
      <Loader />
    </Center>
  )
}
