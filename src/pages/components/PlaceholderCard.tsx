import styles from './PlaceholderCard.module.css';

interface PlaceholderCardProps {
  title: string;
  description: string;
}

function PlaceholderCard({ title, description }: PlaceholderCardProps) {
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      <div className={styles.placeholder}>组件开发占位</div>
    </section>
  );
}

export default PlaceholderCard;
