import React from 'react';
import { useParams } from 'react-router-dom';

const SharedSettingsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <h1>Управление общей директорией: {id}</h1>;
};

export default SharedSettingsPage;
